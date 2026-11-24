"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  conversationHistorySchema,
  type ConversationHistory,
  type Turn,
} from "@bazak/conversation/domain/turn";
import { useGetConversation, useListConversations } from "../api/generated/hooks";
import { useSessionAction, useConversationRequests } from "./chat-actions";
import {
  reconcileConversation,
  runningAttempt,
  waitingNotice,
  errorNotice,
} from "./conversation-recovery";
import {
  displayTurnStream,
  refreshTurnAfterStream,
  markUnsaved,
  type Preview,
  type RequestedTurn,
} from "./turn-preview";

function useAttemptRecovery(
  id: string | null,
  history: ConversationHistory | undefined,
  working: boolean,
  setNotice: (value: string) => void,
) {
  const queryClient = useQueryClient();
  const [pausedAttempt, setPausedAttempt] = useState<string | null>(null);
  const activeAttempt = runningAttempt(history);
  const recovering = activeAttempt !== null && pausedAttempt !== activeAttempt;
  useEffect(
    function recoverPendingAttempt() {
      if (!id || !recovering || working) return;
      const controller = new AbortController();
      const { signal } = controller;

      void reconcileConversation(queryClient, id, signal)
        .then((saved) => {
          if (signal.aborted) return;
          const pending = runningAttempt(saved);

          if (pending) {
            setPausedAttempt(pending);
            setNotice(waitingNotice);
          }
        })
        .catch((cause) => {
          if (signal.aborted) return;
          setPausedAttempt(activeAttempt);
          setNotice(errorNotice(cause));
        });

      return () => controller.abort();
    },
    [id, recovering, working, activeAttempt, queryClient, setNotice],
  );

  return { recovering, setPausedAttempt };
}

function useConversationState(initialId: string | null) {
  const [id, setId] = useState(initialId);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const listQuery = useListConversations();

  const historyQuery = useGetConversation(id ?? "", {
    query: { enabled: id !== null, select: conversationHistorySchema.parse },
  });

  const history = historyQuery.data;

  const actions = useSessionAction(setNotice);
  const requests = useConversationRequests(actions.mutationOptions);
  const recovery = useAttemptRecovery(id, history, actions.working, setNotice);
  const busy = actions.working || recovery.recovering;
  const loading = id ? historyQuery.isPending : listQuery.isPending;
  const inaccessible = id !== null && historyQuery.isError && !history;

  return {
    id,
    setId,
    draft,
    setDraft,
    notice,
    setNotice,
    preview,
    setPreview,
    listQuery,
    historyQuery,
    history,
    actions,
    requests,
    recovery,
    busy,
    loading,
    inaccessible,
  };
}

type SessionState = ReturnType<typeof useConversationState>;

async function openNewChat(state: SessionState, openConversation: (id: string) => void) {
  const controller = state.actions.beginAction(state.recovery.recovering);

  if (!controller) return;

  try {
    const threadId = await state.requests.createChat(controller.signal);
    openConversation(threadId);
  } catch (cause) {
    if (!controller.signal.aborted) state.setNotice(errorNotice(cause));
  } finally {
    state.actions.finishAction(controller);
  }
}

async function streamRequestedTurn(
  state: SessionState,
  turn: RequestedTurn,
  acceptDraft: () => void,
  onCreate?: (id: string) => void,
) {
  const controller = state.actions.beginAction(state.recovery.recovering);

  if (!controller) return;
  const { signal } = controller;
  const { setNotice, setPreview } = state;
  const { queryClient, createChat, requestTurn } = state.requests;
  const progress = { queryClient, signal, turn, acceptDraft, setNotice, setPreview };
  setPreview(null);
  let threadId = state.id;

  try {
    if (!threadId) {
      threadId = await createChat(signal);
      onCreate?.(threadId);
      state.setId(threadId);
    }

    const response = await requestTurn(threadId, turn);
    await displayTurnStream(response, { ...progress, threadId });
  } catch (cause) {
    if (signal.aborted) return;
    setNotice(errorNotice(cause));
    setPreview(markUnsaved);
  } finally {
    if (threadId && !signal.aborted)
      await refreshTurnAfterStream({ ...progress, threadId }, state.recovery.setPausedAttempt);

    state.actions.finishAction(controller);
  }
}

function useTurnSubmission(state: SessionState, onCreate?: (id: string) => void) {
  const pendingSend = useRef<{ id: string; text: string } | null>(null);

  const {
    draft,
    setDraft,
    loading,
    busy,
    inaccessible,
    actions: { action },
  } = state;

  function send() {
    if (loading || busy || inaccessible || action.current || !draft.trim()) return;

    if (pendingSend.current?.text !== draft)
      pendingSend.current = { id: crypto.randomUUID(), text: draft };

    function acceptDraft() {
      if (!pendingSend.current) return;
      pendingSend.current = null;
      setDraft((current) => (current === draft ? "" : current));
    }

    return streamRequestedTurn(
      state,
      { turnId: pendingSend.current.id, text: draft },
      acceptDraft,
      onCreate,
    );
  }

  function retry(turn: Turn) {
    if (turn.state === "failed" || turn.state === "interrupted")
      return streamRequestedTurn(state, turn, () => {}, onCreate);
  }

  return { send, retry };
}

function reloadConversation(state: SessionState) {
  const {
    busy,
    setNotice,
    recovery: { setPausedAttempt },
    listQuery,
    historyQuery,
    id,
  } = state;

  if (busy) return;
  setNotice("");
  setPausedAttempt(null);
  void listQuery.refetch();

  if (id) void historyQuery.refetch();
}

export function useShoppingSession(initialId: string | null, onCreate?: (id: string) => void) {
  const router = useRouter();
  const state = useConversationState(initialId);

  const {
    id,
    listQuery,
    historyQuery,
    busy,
    preview,
    history,
    draft,
    loading,
    inaccessible,
    setDraft,
    notice,
  } = state;

  const { send, retry } = useTurnSubmission(state, onCreate);

  const savedPreview =
    preview &&
    history?.turns.some((turn) => turn.turnId === preview.turnId && turn.state === "completed");

  return {
    id,
    history,
    list: listQuery.data?.conversations ?? [],
    listLoading: listQuery.isPending,
    draft,
    notice: notice || errorNotice(historyQuery.error ?? listQuery.error),
    busy,
    loading,
    inaccessible,
    preview: savedPreview ? null : preview,
    setDraft,
    send,
    retry,
    newChat: () => openNewChat(state, (threadId) => router.push("/conversations/" + threadId)),
    reload: () => reloadConversation(state),
  };
}

export type ShoppingSession = ReturnType<typeof useShoppingSession>;
