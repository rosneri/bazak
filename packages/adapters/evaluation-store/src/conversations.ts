import {
  RepositoryError,
  type ConversationRepository,
} from "@bazak/conversation/application/repository";
import { historyCriteriaSchema } from "@bazak/conversation/application/query-planner";
import { database } from "./client.ts";
import { toTurn, toConversation } from "./stored-conversation.ts";
import { acquireTurn, acquireRetry } from "./turn-acquisition.ts";
import {
  interruptExpiredTurn,
  latestAttempt,
  createThreadAccess,
  withStorageErrorHandling,
  type ThreadAccess,
  type Transaction,
} from "./thread-access.ts";
import { settleAttempt } from "./turn-settlement.ts";

async function createThread(tx: Transaction, scope: string, id: string, time: string) {
  const existing = await tx.shoppingThread.findUnique({ where: { id } });

  if (existing && existing.scope !== scope) throw new RepositoryError("not_found");

  if (existing) return { created: false, conversation: toConversation(existing) };
  const now = new Date(time);

  const thread = await tx.shoppingThread.create({
    data: { id, scope, title: "New chat", createdAt: now, updatedAt: now },
  });

  return { created: true, conversation: toConversation(thread) };
}

async function listThreads(client: typeof database, scope: string) {
  return withStorageErrorHandling(async () =>
    (
      await client.shoppingThread.findMany({
        where: { scope },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      })
    ).map(toConversation),
  );
}

async function loadThread(access: ThreadAccess, tx: Transaction, id: string, time: string) {
  await access.requireScopedThread(tx, id);
  await interruptExpiredTurn(tx, id, new Date(time));
  const conversation = toConversation(await access.requireScopedThread(tx, id));

  const rows = await tx.shoppingTurn.findMany({
    where: { threadId: id },
    orderBy: { ordinal: "asc" },
    include: latestAttempt,
  });

  return { conversation, turns: rows.map(toTurn) };
}

async function readRelevantHistory(
  access: ThreadAccess,
  client: typeof database,
  scope: string,
  threadId: string,
  category: string,
) {
  return withStorageErrorHandling(async () => {
    await access.requireScopedThread(client, threadId);

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
}

export function createConversationRepository(
  scope = "shopper",
  client = database,
): ConversationRepository {
  const access = createThreadAccess(scope, client);

  return {
    create: (id, time) => access.withThreadLock(id, (tx) => createThread(tx, scope, id, time)),
    list: () => listThreads(client, scope),
    load: (id, time) => access.withThreadLock(id, (tx) => loadThread(access, tx, id, time)),
    relevantHistory: (id, category) => readRelevantHistory(access, client, scope, id, category),
    beginTurn: (id, input, time, deadline) =>
      access.withThreadLock(id, (tx) => acquireTurn(access, tx, id, input, time, deadline)),
    beginRetry: (id, turnId, expected, time, deadline) =>
      access.withThreadLock(id, (tx) =>
        acquireRetry(access, tx, id, turnId, expected, time, deadline),
      ),
    finish(threadId, turnId, number, time, assistant, metrics, decision) {
      return settleAttempt(access, time, {
        threadId,
        turnId,
        number,
        state: "completed",
        metrics,
        decision,
        assistant,
      });
    },
    fail(threadId, turnId, number, time, state, metrics, decision) {
      return settleAttempt(access, time, {
        threadId,
        turnId,
        number,
        state,
        metrics,
        decision,
        assistant: null,
      });
    },
  };
}
