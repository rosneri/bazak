import {
  RepositoryError,
  type ConversationRepository,
} from "@bazak/conversation/application/repository";
import {
  assistantMessageSchema,
  attemptMetricsSchema,
  conversationSchema,
  turnSchema,
  type AssistantMessage,
  type AttemptMetrics,
} from "@bazak/conversation/domain/turn";
import {
  type DiscoveryCriteria,
  intentDecisionSchema,
  type IntentDecision,
} from "@bazak/product-discovery/domain/discovery";
import { historyCriteriaSchema } from "@bazak/conversation/application/query-planner";
import { leaseExpired, shouldRetry } from "./attempts.ts";
import { database } from "./client.ts";
import {
  Prisma,
  type ShoppingThread,
  type ShoppingTurn,
  type TurnAttempt,
} from "./generated/client.ts";

type Transaction = Prisma.TransactionClient;

type StoredTurn = ShoppingTurn & { attempts: TurnAttempt[] };

const latestAttempt = {
  attempts: { orderBy: { number: "desc" }, take: 1 },
} satisfies Prisma.ShoppingTurnInclude;

function viewThread(thread: ShoppingThread) {
  const result = conversationSchema.safeParse({
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  });

  if (!result.success) throw new RepositoryError("corrupt_thread");

  return result.data;
}

function viewTurn(row: StoredTurn) {
  const attempt = row.attempts[0];

  if (attempt?.number !== row.attempt || attempt.state !== row.state)
    throw new RepositoryError("corrupt_thread");

  const result = turnSchema.safeParse({
    turnId: row.turnId,
    text: row.text,
    state: row.state,
    attempt: row.attempt,
    assistant: row.assistant,
    decision: row.decision,
    metrics: attempt.metrics,
  });

  if (!result.success) throw new RepositoryError("corrupt_thread");

  return result.data;
}

async function protect<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError("storage_unavailable");
  }
}

async function activeTurn(tx: Transaction, threadId: string) {
  return tx.shoppingTurn.findFirst({
    where: { threadId, state: "running" },
    include: latestAttempt,
  });
}

async function interruptExpired(tx: Transaction, threadId: string, now: Date) {
  const active = await activeTurn(tx, threadId);

  if (!active) return;
  const attempt = active.attempts[0];

  if (!attempt || attempt.number !== active.attempt) throw new RepositoryError("corrupt_thread");

  if (!leaseExpired(attempt.cutoff, now)) return active;
  const turnId = active.turnId;
  await tx.turnAttempt.update({
    where: { threadId_turnId_number: { threadId, turnId, number: active.attempt } },
    data: { state: "interrupted", endedAt: attempt.cutoff },
  });
  await tx.shoppingTurn.update({
    where: { threadId_turnId: { threadId, turnId } },
    data: { state: "interrupted" },
  });
  await tx.shoppingThread.update({ where: { id: threadId }, data: { updatedAt: attempt.cutoff } });
}

export function createConversationRepository(
  scope = "shopper",
  client = database,
): ConversationRepository {
  // Advisory locks are transaction-scoped, also allowing idempotent creation before a row exists.
  function locked<T>(id: string, operation: (tx: Transaction) => Promise<T>) {
    return protect(() =>
      client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id.toLowerCase()}::text, 0))`;

        return operation(tx);
      }),
    );
  }

  async function getThread(tx: Transaction, id: string) {
    const thread = await tx.shoppingThread.findFirst({ where: { id, scope } });

    if (!thread) throw new RepositoryError("not_found");

    return thread;
  }

  async function settle(
    threadId: string,
    turnId: string,
    number: number,
    time: string,
    state: "completed" | "failed" | "interrupted",
    metrics: AttemptMetrics,
    decision: IntentDecision | null,
    assistant: AssistantMessage | null,
  ) {
    const arrival = performance.now();
    const parsedMetrics = attemptMetricsSchema.parse(metrics);
    const parsedAssistant = assistant === null ? null : assistantMessageSchema.parse(assistant);
    const parsedDecision = decision === null ? null : intentDecisionSchema.parse(decision);

    const accepted = await locked(threadId, async (tx) => {
      await getThread(tx, threadId);
      // Keep the service clock and include time spent waiting for the thread lock.
      const now = new Date(Date.parse(time) + Math.ceil(performance.now() - arrival));
      const active = await interruptExpired(tx, threadId, now);

      if (active?.turnId !== turnId.toLowerCase() || active.attempt !== number) return false;
      parsedMetrics.durationMs = Math.max(
        parsedMetrics.durationMs,
        now.getTime() - active.attempts[0].startedAt.getTime(),
      );
      await tx.turnAttempt.update({
        where: { threadId_turnId_number: { threadId, turnId, number } },
        data: { endedAt: now, state, metrics: parsedMetrics },
      });
      await tx.shoppingTurn.update({
        where: { threadId_turnId: { threadId, turnId } },
        data: {
          state,
          assistant: parsedAssistant ?? Prisma.DbNull,
          decision: parsedDecision ?? Prisma.DbNull,
        },
      });
      const searches = new Map<string, DiscoveryCriteria[]>();

      if (parsedMetrics.queries.length && parsedAssistant) {
        for (const part of parsedAssistant.parts) {
          if (part.type !== "products") continue;
          const { kind, criteria } = part.group;

          if ((kind !== "matched" && kind !== "empty") || !criteria?.category) continue;
          const grouped = searches.get(criteria.category) ?? [];
          grouped.push(criteria);
          searches.set(criteria.category, grouped);
        }
      }

      if (searches.size) {
        await tx.searchEvidence.createMany({
          data: Array.from(searches, ([category, criteria]) => ({
            threadId,
            turnId,
            endedAt: now,
            category,
            criteria,
          })),
        });
      }

      await tx.shoppingThread.update({ where: { id: threadId }, data: { updatedAt: now } });

      return true;
    });

    if (!accepted) throw new RepositoryError("attempt_conflict");
  }

  return {
    create(id, time) {
      return locked(id, async (tx) => {
        const existing = await tx.shoppingThread.findUnique({ where: { id } });

        if (existing && existing.scope !== scope) throw new RepositoryError("not_found");

        if (existing) return { created: false, conversation: viewThread(existing) };
        const now = new Date(time);

        const thread = await tx.shoppingThread.create({
          data: { id, scope, title: "New chat", createdAt: now, updatedAt: now },
        });

        return { created: true, conversation: viewThread(thread) };
      });
    },
    list() {
      return protect(async () =>
        (
          await client.shoppingThread.findMany({
            where: { scope },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          })
        ).map(viewThread),
      );
    },
    load(id, time) {
      return locked(id, async (tx) => {
        await getThread(tx, id);
        await interruptExpired(tx, id, new Date(time));
        const conversation = viewThread(await getThread(tx, id));

        const rows = await tx.shoppingTurn.findMany({
          where: { threadId: id },
          orderBy: { ordinal: "asc" },
          include: latestAttempt,
        });

        return { conversation, turns: rows.map(viewTurn) };
      });
    },
    relevantHistory(threadId, category) {
      return protect(async () => {
        await getThread(client, threadId);

        const evidence = await client.searchEvidence.findMany({
          where: {
            category,
            threadId: { not: threadId },
            turn: { state: "completed", thread: { scope } },
          },
          orderBy: [{ endedAt: "desc" }, { threadId: "desc" }, { turnId: "desc" }],
          take: 5,
          include: { turn: { select: { text: true } } },
        });

        return evidence.map((row) => {
          const criteria = historyCriteriaSchema.safeParse(row.criteria);

          if (!criteria.success) throw new RepositoryError("corrupt_thread");

          return { criteria: criteria.data, text: row.turn.text.slice(0, 240) };
        });
      });
    },
    beginTurn(threadId, input, time, deadline) {
      return locked(threadId, async (tx) => {
        await getThread(tx, threadId);
        const now = new Date(time);
        await interruptExpired(tx, threadId, now);

        const previous = await tx.shoppingTurn.findUnique({
          where: { threadId_turnId: { threadId, turnId: input.turnId } },
          include: latestAttempt,
        });

        if (previous) {
          if (previous.text !== input.text) throw new RepositoryError("turn_conflict");

          return { accepted: false, turn: viewTurn(previous) };
        }

        if (await activeTurn(tx, threadId)) throw new RepositoryError("thread_busy");

        const last = await tx.shoppingTurn.findFirst({
          where: { threadId },
          orderBy: { ordinal: "desc" },
          select: { ordinal: true },
        });

        const ordinal = (last?.ordinal ?? 0) + 1;

        const turn = await tx.shoppingTurn.create({
          data: {
            threadId,
            ...input,
            ordinal,
            state: "running",
            attempt: 1,
            attempts: {
              create: { number: 1, startedAt: now, cutoff: new Date(deadline), state: "running" },
            },
          },
          include: latestAttempt,
        });

        await tx.shoppingThread.update({
          where: { id: threadId },
          data: { updatedAt: now, title: ordinal === 1 ? input.text.slice(0, 80) : undefined },
        });

        return { accepted: true, turn: viewTurn(turn) };
      });
    },
    beginRetry(threadId, turnId, expected, time, deadline) {
      return locked(threadId, async (tx) => {
        await getThread(tx, threadId);
        const now = new Date(time);
        await interruptExpired(tx, threadId, now);
        const where = { threadId_turnId: { threadId, turnId } };
        const previous = await tx.shoppingTurn.findUnique({ where, include: latestAttempt });

        if (!previous) throw new RepositoryError("not_found");

        if (!shouldRetry(previous, expected)) return { accepted: false, turn: viewTurn(previous) };

        if (await activeTurn(tx, threadId)) throw new RepositoryError("thread_busy");
        const number = previous.attempt + 1;

        const turn = await tx.shoppingTurn.update({
          where,
          data: {
            attempt: number,
            state: "running",
            decision: Prisma.DbNull,
            attempts: {
              create: { number, startedAt: now, cutoff: new Date(deadline), state: "running" },
            },
          },
          include: latestAttempt,
        });

        await tx.shoppingThread.update({ where: { id: threadId }, data: { updatedAt: now } });

        return { accepted: true, turn: viewTurn(turn) };
      });
    },
    finish(threadId, turnId, number, time, assistant, metrics, decision) {
      return settle(threadId, turnId, number, time, "completed", metrics, decision, assistant);
    },
    fail(threadId, turnId, number, time, state, metrics, decision) {
      return settle(threadId, turnId, number, time, state, metrics, decision, null);
    },
  };
}
