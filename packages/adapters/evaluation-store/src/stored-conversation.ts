import { RepositoryError } from "@bazak/conversation/application/repository";
import { conversationSchema, turnSchema } from "@bazak/conversation/domain/turn";
import type { ShoppingThread, ShoppingTurn, TurnAttempt } from "./generated/client.ts";

type StoredTurn = ShoppingTurn & { attempts: TurnAttempt[] };

export function toConversation(thread: ShoppingThread) {
  const result = conversationSchema.safeParse({
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  });

  if (!result.success) throw new RepositoryError("corrupt_thread");

  return result.data;
}

export function toTurn(row: StoredTurn) {
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
