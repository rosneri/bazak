import { database } from "./client.ts";
import { createThreadAccess, interruptExpiredTurn } from "./thread-access.ts";

export function createRecoveryQueue(scope = "shopper", client = database) {
  const access = createThreadAccess(scope, client);

  async function enqueueExpired(now: Date) {
    const expired = await client.turnAttempt.findMany({
      where: { state: "running", cutoff: { lte: now }, turn: { thread: { scope } } },
      select: { threadId: true },
      orderBy: { cutoff: "asc" },
      take: 32,
    });

    for (const { threadId } of expired) {
      // oxlint-disable-next-line no-await-in-loop -- Keep each thread lock short and bound pool usage.
      await access.withThreadLock(threadId, (tx) => interruptExpiredTurn(tx, threadId, now));
    }
  }

  function pending() {
    return client.shoppingTurn.findMany({
      where: {
        recoveryPending: true,
        state: "interrupted",
        thread: { scope, turns: { none: { state: "running" } } },
      },
      select: { threadId: true, turnId: true, attempt: true },
      orderBy: [{ thread: { updatedAt: "asc" } }, { threadId: "asc" }, { ordinal: "asc" }],
      take: 8,
    });
  }

  return { enqueueExpired, pending };
}
