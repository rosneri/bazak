import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { idSchema, sendTurnInputSchema } from "@bazak/conversation/domain/turn";
import { getConversation, getGetConversationQueryKey } from "../api/generated/hooks";
import { RequestProblem } from "../api/fetch";
import { errorNotice } from "./conversation-recovery";
import type { z } from "zod";

const submissionSchema = sendTurnInputSchema
  .extend({
    threadId: idSchema.describe("Conversation that owns the pending message."),
  })
  .describe("A submitted draft awaiting confirmation in this browser tab.");

type Submission = z.infer<typeof submissionSchema>;

function key(thread: string | null) {
  return "bazak.pending." + (thread ?? "home");
}

function readSubmission(scope: string | null) {
  const raw = sessionStorage.getItem(key(scope));

  if (!raw) return null;
  const pending = submissionSchema.parse(JSON.parse(raw));

  if (scope && pending.threadId !== scope)
    throw new Error("Pending message belongs to another chat.");

  return pending;
}

export function rememberSubmission(thread: string | null, text: string) {
  const previous = readSubmission(thread);

  if (previous?.text === text) return previous;

  const pending = submissionSchema.parse({
    threadId: thread ?? previous?.threadId ?? crypto.randomUUID(),
    turnId: crypto.randomUUID(),
    text,
  });

  sessionStorage.setItem(key(thread), JSON.stringify(pending));

  return pending;
}

export function moveSubmissionToThread(pending: Submission) {
  sessionStorage.setItem(key(pending.threadId), JSON.stringify(pending));
  sessionStorage.removeItem(key(null));
}

export function acknowledgeSubmission(scope: string, turnId: string) {
  if (readSubmission(scope)?.turnId === turnId) sessionStorage.removeItem(key(scope));
}

async function restoreSubmission(
  scope: string | null,
  controller: AbortController,
  cache: QueryClient,
  setDraft: Dispatch<SetStateAction<string>>,
) {
  const pending = readSubmission(scope);

  if (!pending) return;
  const { threadId, turnId, text } = pending;

  const saved = await getConversation(threadId, { signal: controller.signal }).catch((error) => {
    if (!scope && error instanceof RequestProblem && error.code === "not_found") return null;
    throw error;
  });

  controller.signal.throwIfAborted();

  if (saved) cache.setQueryData(getGetConversationQueryKey(threadId), saved);

  if (!scope && saved) {
    moveSubmissionToThread(pending);
    window.location.replace("/conversations/" + threadId);

    return;
  }

  if (saved?.turns.some((turn) => turn.turnId === turnId && turn.text === text))
    acknowledgeSubmission(threadId, turnId);
  else setDraft(text);
}

export function usePendingSubmission(
  initialId: string | null,
  setDraft: Dispatch<SetStateAction<string>>,
  setNotice: (message: string) => void,
) {
  const [check, setCheck] = useState({ scope: initialId });
  const [checked, setChecked] = useState(false);
  const cache = useQueryClient();

  useEffect(
    function checkPendingSubmission() {
      const controller = new AbortController();

      void restoreSubmission(check.scope, controller, cache, setDraft)
        .then(() => {
          if (!controller.signal.aborted) setChecked(true);
        })
        .catch((error) => {
          if (!controller.signal.aborted) setNotice(errorNotice(error));
        });

      return () => controller.abort();
    },
    [check, cache, setDraft, setNotice],
  );

  return { checked, recheck: () => setCheck({ scope: check.scope }) };
}
