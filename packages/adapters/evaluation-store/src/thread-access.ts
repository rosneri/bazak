import { RepositoryError } from "@bazak/conversation/application/repository";
import { database } from "./client.ts";
import type { Prisma } from "./generated/client.ts";
import { leaseExpired } from "./attempts.ts";

export type Transaction = Prisma.TransactionClient;

export const latestAttempt = {
  attempts: { orderBy: { number: "desc" }, take: 1 },
} satisfies Prisma.ShoppingTurnInclude;

export async function withStorageErrorHandling<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    throw new RepositoryError("storage_unavailable");
  }
}

export async function findRunningTurn(tx: Transaction, threadId: string) {
  return tx.shoppingTurn.findFirst({
    where: { threadId, state: "running" },
    include: latestAttempt,
  });
}

export async function interruptExpiredTurn(tx: Transaction, threadId: string, now: Date) {
  const active = await findRunningTurn(tx, threadId);

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

export function createThreadAccess(scope: string, client: typeof database) {
  // Advisory locks are transaction-scoped, also allowing idempotent creation before a row exists.
  function withThreadLock<T>(id: string, operation: (tx: Transaction) => Promise<T>) {
    return withStorageErrorHandling(() =>
      client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id.toLowerCase()}::text, 0))`;

        return operation(tx);
      }),
    );
  }

  async function requireScopedThread(tx: Transaction, id: string) {
    const thread = await tx.shoppingThread.findFirst({ where: { id, scope } });

    if (!thread) throw new RepositoryError("not_found");

    return thread;
  }

  return { withThreadLock, requireScopedThread };
}

export type ThreadAccess = ReturnType<typeof createThreadAccess>;
