import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConversationHistory } from "@bazak/conversation/domain/turn";
import {
  getGetConversationQueryKey,
  getListConversationsQueryKey,
  useCreateConversation,
  useRetryTurn,
  useSendTurn,
} from "../api/generated/hooks";
import type { ConversationListResponse } from "../api/generated/models";
import type { RequestedTurn } from "./turn-preview";

export function useSessionAction(setNotice: (notice: string) => void) {
  const [working, setWorking] = useState(false);
  const action = useRef<AbortController | null>(null);
  useEffect(function abortActionOnUnmount() {
    return () => action.current?.abort();
  }, []);

  function beginAction(recovering: boolean) {
    if (working || recovering || action.current) return null;
    const controller = new AbortController();
    action.current = controller;
    setWorking(true);
    setNotice("");

    return controller;
  }

  function finishAction(controller: AbortController) {
    if (action.current !== controller) return;
    action.current = null;

    if (!controller.signal.aborted) setWorking(false);
  }

  const mutationOptions = useMemo(
    () => ({
      request: {
        // The stream remains part of the action after its mutation receives the response headers.
        get signal() {
          return action.current?.signal;
        },
      },
    }),
    [],
  );

  return { action, working, beginAction, finishAction, mutationOptions };
}

export function useConversationRequests(
  mutationOptions: ReturnType<typeof useSessionAction>["mutationOptions"],
) {
  const queryClient = useQueryClient();
  const pendingCreate = useRef<string | null>(null);

  const { mutateAsync: create } = useCreateConversation(mutationOptions);
  const { mutateAsync: submitTurn } = useSendTurn(mutationOptions);
  const { mutateAsync: retryTurn } = useRetryTurn(mutationOptions);

  async function requestTurn(id: string, turn: RequestedTurn) {
    const { turnId, text, attempt } = turn;

    return attempt === undefined
      ? submitTurn({ id, data: { turnId, text } })
      : retryTurn({ id, turnId, data: { expectedAttempt: attempt } });
  }

  async function createChat(signal: AbortSignal, requestedId?: string) {
    pendingCreate.current = requestedId ?? pendingCreate.current ?? crypto.randomUUID();
    const { conversation } = await create({ data: { id: pendingCreate.current } });
    signal.throwIfAborted();
    pendingCreate.current = null;
    cacheNewConversation(queryClient, conversation);

    return conversation.id;
  }

  return { createChat, requestTurn, queryClient };
}

function cacheNewConversation(
  queryClient: ReturnType<typeof useQueryClient>,
  conversation: ConversationHistory["conversation"],
) {
  queryClient.setQueryData<ConversationListResponse>(
    getListConversationsQueryKey(),
    (previous) => ({
      conversations: [
        conversation,
        ...(previous?.conversations.filter((chat) => chat.id !== conversation.id) ?? []),
      ],
    }),
  );
  queryClient.setQueryData<ConversationHistory>(
    getGetConversationQueryKey(conversation.id),
    (previous) => previous ?? { conversation, turns: [] },
  );
}
