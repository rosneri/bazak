import { RepositoryError } from "@bazak/conversation/application/repository";
import type { SendTurnInput } from "@bazak/conversation/domain/turn";
import { Prisma } from "./generated/client.ts";
import { shouldRetry } from "./attempts.ts";
import { toTurn } from "./stored-conversation.ts";
import {
  findRunningTurn,
  interruptExpiredTurn,
  latestAttempt,
  type ThreadAccess,
  type Transaction,
} from "./thread-access.ts";

async function insertRunningTurn(
  tx: Transaction,
  threadId: string,
  input: SendTurnInput,
  now: Date,
  deadline: string,
) {
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

  return { accepted: true, turn: toTurn(turn) };
}

export async function acquireTurn(
  access: ThreadAccess,
  tx: Transaction,
  threadId: string,
  input: SendTurnInput,
  time: string,
  deadline: string,
) {
  await access.requireScopedThread(tx, threadId);
  const now = new Date(time);
  await interruptExpiredTurn(tx, threadId, now);

  const previous = await tx.shoppingTurn.findUnique({
    where: { threadId_turnId: { threadId, turnId: input.turnId } },
    include: latestAttempt,
  });

  if (previous) {
    if (previous.text !== input.text) throw new RepositoryError("turn_conflict");

    return { accepted: false, turn: toTurn(previous) };
  }

  if (await findRunningTurn(tx, threadId)) throw new RepositoryError("thread_busy");

  return insertRunningTurn(tx, threadId, input, now, deadline);
}

export async function acquireRetry(
  access: ThreadAccess,
  tx: Transaction,
  threadId: string,
  turnId: string,
  expected: number,
  time: string,
  deadline: string,
) {
  await access.requireScopedThread(tx, threadId);
  const now = new Date(time);
  await interruptExpiredTurn(tx, threadId, now);
  const where = { threadId_turnId: { threadId, turnId } };
  const previous = await tx.shoppingTurn.findUnique({ where, include: latestAttempt });

  if (!previous) throw new RepositoryError("not_found");

  if (!shouldRetry(previous, expected)) return { accepted: false, turn: toTurn(previous) };

  if (await findRunningTurn(tx, threadId)) throw new RepositoryError("thread_busy");
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

  return { accepted: true, turn: toTurn(turn) };
}
