import type { QueryClient } from "@tanstack/react-query";
import {
  conversationHistorySchema,
  type ConversationHistory,
} from "@bazak/conversation/domain/turn";
import {
  getConversation,
  getGetConversationQueryOptions,
  getListConversationsQueryKey,
} from "../api/generated/hooks";
import { RequestProblem } from "../api/fetch";

export const waitingNotice = "The reply is still pending. Refresh to check its saved status.";

export function runningAttempt(history?: ConversationHistory) {
  const running = history?.turns.find((turn) => turn.state === "running");

  return running ? running.turnId + "/" + running.attempt : null;
}

export async function reconcileConversation(
  queryClient: QueryClient,
  id: string,
  signal: AbortSignal,
) {
  const cutoff = Date.now() + 93_000;

  const options = getGetConversationQueryOptions(id, {
    query: {
      queryFn: ({ signal: querySignal }) =>
        getConversation(id, { signal: AbortSignal.any([signal, querySignal]) }),
    },
  });

  await queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });

  try {
    for (let delay = 250; ; delay = Math.min(2000, delay * 2)) {
      signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- Each saved status decides whether another read is needed.
      const response = await queryClient.fetchQuery(options);
      signal.throwIfAborted();
      const saved = conversationHistorySchema.parse(response);

      if (!runningAttempt(saved) || Date.now() >= cutoff) return saved;

      // oxlint-disable-next-line no-await-in-loop -- Back off between status requests.
      await waitForNextRead(delay, signal);
    }
  } finally {
    if (!signal.aborted)
      void queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey(), exact: true });
  }
}

function waitForNextRead(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    function abort() {
      window.clearTimeout(timer);
      reject(signal.reason);
    }

    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);

    signal.addEventListener("abort", abort, { once: true });
  });
}

export function errorNotice(cause: unknown) {
  if (!cause) return "";

  return cause instanceof RequestProblem
    ? cause.message
    : "Couldn’t confirm the saved chat. Check the connection and try again.";
}
