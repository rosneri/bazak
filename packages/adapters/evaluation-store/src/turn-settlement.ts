import { RepositoryError } from "@bazak/conversation/application/repository";
import {
  assistantMessageSchema,
  attemptMetricsSchema,
  type AttemptMetrics,
  type AssistantMessage,
} from "@bazak/conversation/domain/turn";
import {
  intentDecisionSchema,
  type DiscoveryCriteria,
  type IntentDecision,
} from "@bazak/product-discovery/domain/discovery";
import { Prisma } from "./generated/client.ts";
import { interruptExpiredTurn, type ThreadAccess, type Transaction } from "./thread-access.ts";

interface TurnSettlement {
  threadId: string;
  turnId: string;
  number: number;
  state: "completed" | "failed" | "interrupted";
  metrics: AttemptMetrics;
  decision: IntentDecision | null;
  assistant: AssistantMessage | null;
}

function groupSearchEvidence(assistant: AssistantMessage | null, metrics: AttemptMetrics) {
  const searches = new Map<string, DiscoveryCriteria[]>();

  if (!metrics.queries.length || !assistant) return searches;

  for (const part of assistant.parts) {
    if (part.type !== "products") continue;
    const { kind, criteria } = part.group;

    if ((kind !== "matched" && kind !== "empty") || !criteria?.category) continue;
    const grouped = searches.get(criteria.category) ?? [];
    grouped.push(criteria);
    searches.set(criteria.category, grouped);
  }

  return searches;
}

async function persistSettlement(tx: Transaction, settlement: TurnSettlement, now: Date) {
  const { threadId, turnId, number, state, metrics, decision, assistant } = settlement;
  await tx.turnAttempt.update({
    where: { threadId_turnId_number: { threadId, turnId, number } },
    data: { endedAt: now, state, metrics },
  });
  await tx.shoppingTurn.update({
    where: { threadId_turnId: { threadId, turnId } },
    data: { state, assistant: assistant ?? Prisma.DbNull, decision: decision ?? Prisma.DbNull },
  });
  const searches = groupSearchEvidence(assistant, metrics);

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
}

export async function settleAttempt(access: ThreadAccess, time: string, outcome: TurnSettlement) {
  const arrival = performance.now();
  const { threadId, turnId, number, metrics, assistant, decision } = outcome;

  const settlement = {
    ...outcome,
    metrics: attemptMetricsSchema.parse(metrics),
    assistant: assistant === null ? null : assistantMessageSchema.parse(assistant),
    decision: decision === null ? null : intentDecisionSchema.parse(decision),
  };

  const accepted = await access.withThreadLock(threadId, async (tx) => {
    await access.requireScopedThread(tx, threadId);
    // Include time spent waiting for the thread lock in the service clock.
    const now = new Date(Date.parse(time) + Math.ceil(performance.now() - arrival));
    const active = await interruptExpiredTurn(tx, threadId, now);

    if (active?.turnId !== turnId.toLowerCase() || active.attempt !== number) return false;
    settlement.metrics.durationMs = Math.max(
      settlement.metrics.durationMs,
      now.getTime() - active.attempts[0].startedAt.getTime(),
    );
    await persistSettlement(tx, settlement, now);

    return true;
  });

  if (!accepted) throw new RepositoryError("attempt_conflict");
}
