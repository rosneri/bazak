"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  conversationHistorySchema,
  type ConversationHistory,
  type MessagePart,
  type Turn,
} from "@bazak/conversation/domain/turn";
import {
  getConversation,
  getGetConversationQueryKey,
  getGetConversationQueryOptions,
  getListConversationsQueryKey,
  useCreateConversation,
  useGetConversation,
  useListConversations,
  useRetryTurn,
  useSendTurn,
} from "../api/generated/hooks";
import type { ConversationListResponse } from "../api/generated/models";
import { RequestProblem } from "../api/fetch";
import { readTurnStream } from "./stream";

interface Preview {
  turnId: string;
  text: string;
  parts: MessagePart[];
  unsaved: boolean;
}

export function useShoppingSession(initialId: string | null, onCreate?: (id: string) => void) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState(false);
  const [pausedAttempt, setPausedAttempt] = useState<string | null>(null);
  const action = useRef<AbortController | null>(null);
  const pendingCreate = useRef<string | null>(null);
  const pendingSend = useRef<{ id: string; text: string } | null>(null);
  const listQuery = useListConversations();

  const historyQuery = useGetConversation(id ?? "", {
    query: { enabled: id !== null, select: conversationHistorySchema.parse },
  });

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

  const { mutateAsync: create } = useCreateConversation(mutationOptions);
  const { mutateAsync: submitTurn } = useSendTurn(mutationOptions);
  const { mutateAsync: retryTurn } = useRetryTurn(mutationOptions);

  const history = historyQuery.data;
  const activeAttempt = runningAttempt(history);
  const recovering = activeAttempt !== null && pausedAttempt !== activeAttempt;
  const busy = working || recovering;
  const loading = id ? historyQuery.isPending : listQuery.isPending;
  const inaccessible = id !== null && historyQuery.isError && !history;
  const savedPreview = preview && wasCompleted(history, preview.turnId);

  useEffect(
    () => () => {
      action.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!id || !recovering || working) return;
    const controller = new AbortController();
    const { signal } = controller;

    void reconcile(queryClient, id, signal)
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
  }, [id, recovering, working, activeAttempt, queryClient]);

  function beginAction() {
    if (busy || action.current) return null;
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

  async function createChat(signal: AbortSignal) {
    pendingCreate.current ??= crypto.randomUUID();
    const { conversation } = await create({ data: { id: pendingCreate.current } });
    signal.throwIfAborted();
    pendingCreate.current = null;
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

    return conversation.id;
  }

  async function newChat() {
    const controller = beginAction();

    if (!controller) return;

    try {
      const threadId = await createChat(controller.signal);
      router.push("/conversations/" + threadId);
    } catch (cause) {
      if (!controller.signal.aborted) setNotice(errorNotice(cause));
    } finally {
      finishAction(controller);
    }
  }

  async function run(turnId: string, text: string, attempt?: number) {
    const controller = beginAction();

    if (!controller) return;
    const { signal } = controller;
    setPreview(null);
    let threadId = id;
    let accepted = false;
    let replyAttempt = attempt === undefined ? 1 : attempt + 1;

    function accept() {
      accepted = true;

      if (attempt === undefined) {
        pendingSend.current = null;
        setDraft((current) => (current === text ? "" : current));
      }
    }

    try {
      if (!threadId) {
        threadId = await createChat(signal);
        onCreate?.(threadId);
        setId(threadId);
      }

      const response =
        attempt === undefined
          ? await submitTurn({ id: threadId, data: { turnId, text } })
          : await retryTurn({ id: threadId, turnId, data: { expectedAttempt: attempt } });

      let terminal = false;

      for await (const event of readTurnStream(response)) {
        signal.throwIfAborted();

        if (event.turnId !== turnId) continue;

        if (event.type === "status") {
          accept();
          replyAttempt = event.attempt;
          setPreview({ turnId, text, parts: [], unsaved: false });
        } else if (event.type === "done") {
          terminal = true;
          const queryKey = getGetConversationQueryKey(threadId);
          await queryClient.cancelQueries({ queryKey, exact: true });
          signal.throwIfAborted();

          const done: Turn = {
            turnId,
            text,
            state: "completed",
            attempt: replyAttempt,
            assistant: event.assistant,
            metrics: null,
            decision: null,
          };

          queryClient.setQueryData<ConversationHistory>(
            queryKey,
            (previous) => previous && { ...previous, turns: replaceTurn(previous.turns, done) },
          );
          setPreview(null);
          break;
        } else if (event.type === "error") {
          terminal = true;
          setNotice(event.message);
          setPreview(markUnsaved);
          break;
        } else {
          const part: MessagePart =
            event.type === "products" ? event.part : { type: "text", text: event.text };

          setPreview(
            (current) => current && { ...current, parts: appendDelta(current.parts, part) },
          );
        }
      }

      if (!terminal) setPreview(markUnsaved);
    } catch (cause) {
      if (signal.aborted) return;
      setNotice(errorNotice(cause));
      setPreview(markUnsaved);
    } finally {
      if (threadId && !signal.aborted) {
        try {
          const saved = await reconcile(queryClient, threadId, signal);

          if (!accepted && saved.turns.some((turn) => turn.turnId === turnId && turn.text === text))
            accept();

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

      finishAction(controller);
    }
  }

  function send() {
    if (loading || busy || inaccessible || action.current || !draft.trim()) return;

    if (pendingSend.current?.text !== draft)
      pendingSend.current = { id: crypto.randomUUID(), text: draft };

    return run(pendingSend.current.id, draft);
  }

  function retry(turn: Turn) {
    if (turn.state === "failed" || turn.state === "interrupted")
      return run(turn.turnId, turn.text, turn.attempt);
  }

  function reload() {
    if (busy) return;
    setNotice("");
    setPausedAttempt(null);
    void listQuery.refetch();

    if (id) void historyQuery.refetch();
  }

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
    newChat,
    reload,
  };
}

const waitingNotice = "The reply is still pending. Refresh to check its saved status.";

function runningAttempt(history?: ConversationHistory) {
  const running = history?.turns.find((turn) => turn.state === "running");

  return running ? running.turnId + "/" + running.attempt : null;
}

async function reconcile(queryClient: QueryClient, id: string, signal: AbortSignal) {
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

function errorNotice(cause: unknown) {
  if (!cause) return "";

  return cause instanceof RequestProblem
    ? cause.message
    : "Couldn’t confirm the saved chat. Check the connection and try again.";
}

function markUnsaved(preview: Preview | null) {
  return preview && { ...preview, unsaved: true };
}

function wasCompleted(history: ConversationHistory | undefined, turnId: string) {
  return history?.turns.some((turn) => turn.turnId === turnId && turn.state === "completed");
}

function replaceTurn(turns: Turn[], next: Turn) {
  return turns.some((turn) => turn.turnId === next.turnId)
    ? turns.map((turn) => (turn.turnId === next.turnId ? next : turn))
    : [...turns, next];
}

function appendDelta(parts: MessagePart[], part: MessagePart): MessagePart[] {
  const last = parts.at(-1);

  if (last?.type === "text" && part.type === "text")
    return [...parts.slice(0, -1), { type: "text", text: last.text + part.text }];

  return [...parts, part];
}
