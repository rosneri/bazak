import type { Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { ConversationHistory, MessagePart, Turn } from "@bazak/conversation/domain/turn";
import { getGetConversationQueryKey } from "../api/generated/hooks";
import { appendDelta, revealText } from "./stream-presentation";
import { readTurnStream } from "./stream";
import {
  reconcileConversation,
  runningAttempt,
  waitingNotice,
  errorNotice,
} from "./conversation-recovery";

export interface Preview {
  turnId: string;
  text: string;
  parts: MessagePart[];
  pendingLabel?: string;
  unsaved: boolean;
}

interface PreviewControls {
  setPreview: Dispatch<SetStateAction<Preview | null>>;
  setNotice: (notice: string) => void;
}

export interface RequestedTurn {
  turnId: string;
  text: string;
  attempt?: number;
}

interface TurnProgress extends PreviewControls {
  queryClient: QueryClient;
  threadId: string;
  signal: AbortSignal;
  turn: RequestedTurn;
  acceptDraft: () => void;
}

async function cacheCompletedTurn(
  progress: TurnProgress,
  assistant: NonNullable<Turn["assistant"]>,
  attempt: number,
) {
  const {
    queryClient,
    threadId,
    signal,
    turn: { turnId, text },
  } = progress;

  const queryKey = getGetConversationQueryKey(threadId);
  await queryClient.cancelQueries({ queryKey, exact: true });
  signal.throwIfAborted();

  const done: Turn = {
    turnId,
    text,
    state: "completed",
    attempt,
    assistant,
    metrics: null,
    decision: null,
  };

  queryClient.setQueryData<ConversationHistory>(
    queryKey,
    (previous) => previous && { ...previous, turns: replaceTurn(previous.turns, done) },
  );
}

export async function displayTurnStream(response: Response, progress: TurnProgress) {
  const { signal, turn, setPreview, setNotice, acceptDraft } = progress;
  const { turnId, text } = turn;
  let replyAttempt = (turn.attempt ?? 0) + 1;

  for await (const event of readTurnStream(response)) {
    signal.throwIfAborted();

    if (event.turnId !== turnId) continue;

    if (event.type === "status") {
      acceptDraft();
      replyAttempt = event.attempt;
      setPreview({ turnId, text, parts: [], unsaved: false });
    } else if (event.type === "done") {
      await cacheCompletedTurn(progress, event.assistant, replyAttempt);
      setPreview(null);

      return;
    } else if (event.type === "error") {
      setNotice(event.message);
      setPreview(markUnsaved);

      return;
    } else if (event.type === "lookup") {
      setPreview((current) => current && { ...current, pendingLabel: event.label });
    } else if (event.type === "products") {
      await revealGroup(event.part, progress);
    } else {
      for await (const delta of revealText(event.text, signal)) {
        setPreview(
          (current) => current && { ...current, parts: appendDelta(current.parts, delta) },
        );
      }
    }
  }

  setPreview(markUnsaved);
}

export async function refreshTurnAfterStream(
  progress: TurnProgress,
  setPausedAttempt: (attempt: string | null) => void,
) {
  const {
    queryClient,
    threadId,
    signal,
    acceptDraft,
    turn: { turnId, text },
    setPreview,
    setNotice,
  } = progress;

  try {
    const saved = await reconcileConversation(queryClient, threadId, signal);

    if (saved.turns.some((turn) => turn.turnId === turnId && turn.text === text)) acceptDraft();

    const pending = runningAttempt(saved);
    setPausedAttempt(pending);

    if (pending) setNotice(waitingNotice);
  } catch (cause) {
    if (!signal.aborted) {
      setNotice(errorNotice(cause));
      setPreview(markUnsaved);
    }
  }

  if (!signal.aborted) setPreview((current) => (current?.parts.length ? current : null));
}

export function markUnsaved(preview: Preview | null) {
  return preview && { ...preview, pendingLabel: undefined, unsaved: true };
}

function replaceTurn(turns: Turn[], next: Turn) {
  return turns.some((turn) => turn.turnId === next.turnId)
    ? turns.map((turn) => (turn.turnId === next.turnId ? next : turn))
    : [...turns, next];
}

async function revealGroup(
  part: Extract<MessagePart, { type: "products" }>,
  progress: TurnProgress,
) {
  const { setPreview, signal } = progress;
  let message = "";

  for await (const delta of revealText(part.group.message, signal)) {
    const first = !message;
    message += delta;
    const visible = { ...part, group: { ...part.group, message } };
    setPreview(
      (current) =>
        current && {
          ...current,
          pendingLabel: undefined,
          parts: [...(first ? current.parts : current.parts.slice(0, -1)), visible],
        },
    );
  }
}
