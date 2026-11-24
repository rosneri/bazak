import type { createConversationService } from "@bazak/conversation/application/chat";
import type { createRecoveryQueue } from "@bazak/evaluation-store/recovery";
import { RepositoryError } from "@bazak/conversation/application/repository";

type Queue = ReturnType<typeof createRecoveryQueue>;

type Candidate = Awaited<ReturnType<Queue["pending"]>>[number];

type Chat = Pick<ReturnType<typeof createConversationService>, "retry">;

async function recoverTurn(chat: Chat, candidate: Candidate) {
  const { threadId, turnId, attempt } = candidate;

  try {
    const stream = await chat.retry(threadId, turnId, attempt);

    for await (const event of stream) {
      if (event.type === "error")
        console.error("Recovery attempt failed", { turnId, code: event.code });
    }
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "thread_busy") return;
    console.error("Could not acquire recovery attempt", { turnId, attempt });
  }
}

export async function recoverExpiredTurns(queue: Queue, chat: Chat, now = new Date()) {
  await queue.enqueueExpired(now);
  const candidates = await queue.pending();

  for (const candidate of candidates) {
    // oxlint-disable-next-line no-await-in-loop -- Execute one retry at a time per worker.
    await recoverTurn(chat, candidate);
  }
}
