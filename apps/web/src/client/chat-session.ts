import type {
  Conversation,
  ConversationHistory,
  MessagePart,
  Turn,
} from "@bazak/conversation/domain/turn";
import { createChat, listChats, loadChat, RequestProblem, retryTurn, submitTurn } from "./api.ts";
import { readTurnStream } from "./stream.ts";

interface Preview {
  turnId: string;
  text: string;
  parts: MessagePart[];
  unsaved: boolean;
}

interface Session {
  id: string | null;
  list: Conversation[];
  history: ConversationHistory | null;
  draft: string;
  notice: string;
  busy: boolean;
  loading: boolean;
  inaccessible: boolean;
  preview: Preview | null;
}

export class ChatSession {
  private listeners = new Set<() => void>();
  private controller = new AbortController();
  private state: Session;
  private pendingCreate = cryptoId();
  private pendingSend: { id: string; text: string } | null = null;
  constructor(id: string | null) {
    this.state = {
      id,
      list: [],
      history: null,
      draft: "",
      notice: "",
      busy: false,
      loading: true,
      inaccessible: false,
      preview: null,
    };
  }
  subscribe = (listen: () => void) => {
    this.listeners.add(listen);

    return () => {
      this.listeners.delete(listen);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<Session>) {
    this.state = { ...this.state, ...patch };

    for (const notify of this.listeners) notify();
  }
  draft = (text: string) => this.update({ draft: text });
  start() {
    const controller = new AbortController();
    this.controller = controller;
    void this.refresh(controller.signal);

    return () => controller.abort();
  }
  private async refresh(signal: AbortSignal) {
    try {
      const { id } = this.state;

      const [chats, thread] = await Promise.allSettled([
        listChats(signal),
        id ? loadChat(id, signal) : null,
      ]);

      signal.throwIfAborted();

      if (chats.status === "fulfilled") this.update({ list: chats.value });

      if (thread.status === "rejected") throw thread.reason;
      const history = thread.value;
      this.update({
        history,
        loading: false,
        inaccessible: false,
        notice: chats.status === "rejected" ? notice(chats.reason) : "",
      });

      if (id && history?.turns.some((turn) => turn.state === "running"))
        await this.reconcile(id, signal);
    } catch (cause) {
      if (!signal.aborted)
        this.update({
          loading: false,
          notice: notice(cause),
          inaccessible: !!this.state.id && !this.state.history,
        });
    }
  }
  reload = async () => {
    if (this.state.busy) return;
    this.update({ notice: "", loading: true });
    await this.refresh(this.controller.signal);
  };
  private async ensureChat(signal: AbortSignal) {
    if (this.state.id) return this.state.id;
    const conversation = await createChat(this.pendingCreate, signal);
    signal.throwIfAborted();
    this.pendingCreate = cryptoId();
    window.history.replaceState(null, "", "/conversations/" + conversation.id);
    this.update({
      id: conversation.id,
      history: { conversation, turns: [] },
      list: [conversation, ...this.state.list.filter((chat) => chat.id !== conversation.id)],
    });

    return conversation.id;
  }
  newChat = async () => {
    if (this.state.busy) return;
    const signal = this.controller.signal;
    this.update({ busy: true, notice: "" });

    try {
      const thread = await createChat(this.pendingCreate, signal);
      window.location.assign("/conversations/" + thread.id);
    } catch (cause) {
      if (!signal.aborted) this.update({ busy: false, notice: notice(cause) });
    }
  };
  private async reconcile(id: string, signal: AbortSignal) {
    const cutoff = Date.now() + 93_000;
    this.update({ busy: true });

    try {
      for (let wait = 250; ; wait = Math.min(2000, wait * 2)) {
        // oxlint-disable-next-line no-await-in-loop -- Each authoritative read decides whether another poll is needed.
        const history = await loadChat(id, signal);
        signal.throwIfAborted();
        const active = history.turns.some((turn) => turn.state === "running");
        this.update({ history });

        if (!active) {
          if (
            this.state.preview &&
            history.turns.some(
              (t) => t.turnId === this.state.preview?.turnId && t.state === "completed",
            )
          )
            this.update({ preview: null });
          break;
        }

        if (Date.now() >= cutoff) {
          this.update({ notice: "The reply is still pending. Refresh to check its saved status." });
          break;
        }

        // oxlint-disable-next-line no-await-in-loop -- Back off between status requests.
        await new Promise<void>((resolve) => window.setTimeout(resolve, wait));
        signal.throwIfAborted();
      }

      const list = await listChats(signal);

      if (!signal.aborted) this.update({ list });
    } finally {
      if (!signal.aborted) this.update({ busy: false });
    }
  }
  send = async (text = this.state.draft) => {
    if (this.state.loading || this.state.busy || this.state.inaccessible || !text.trim()) return;

    if (this.pendingSend?.text !== text) this.pendingSend = { id: cryptoId(), text };
    const input = this.pendingSend;
    await this.run(input.id, text);
  };
  retry = async (turn: Turn) => {
    if (this.state.busy || !["failed", "interrupted"].includes(turn.state)) return;
    await this.run(turn.turnId, turn.text, turn.attempt);
  };
  private async run(turnId: string, text: string, attempt?: number) {
    const signal = this.controller.signal;
    this.update({ busy: true, notice: "", preview: null });
    let id = this.state.id;
    let accepted = false;

    try {
      id = await this.ensureChat(signal);

      const response = attempt
        ? await retryTurn(id, turnId, attempt, signal)
        : await submitTurn(id, turnId, text, signal);

      let terminal = false;

      for await (const event of readTurnStream(response)) {
        signal.throwIfAborted();

        if (event.turnId !== turnId) continue;

        if (event.type === "status") {
          accepted = true;
          this.pendingSend = null;
          this.update({
            draft: attempt ? this.state.draft : "",
            preview: { turnId, text, parts: [], unsaved: false },
          });
          continue;
        }

        if (event.type === "done") {
          terminal = true;

          const done: Turn = {
            turnId,
            text,
            state: "completed",
            attempt: attempt ? attempt + 1 : 1,
            assistant: event.assistant,
            metrics: null,
            decision: null,
          };

          const history = this.state.history;

          if (history)
            this.update({
              history: {
                ...history,
                turns: [...history.turns.filter((t) => t.turnId !== turnId), done],
              },
              preview: null,
            });
        } else if (event.type === "error") {
          this.update({
            notice: event.message,
            preview: this.state.preview ? { ...this.state.preview, unsaved: true } : null,
          });
          terminal = true;
        } else if (this.state.preview) {
          const part: MessagePart =
            event.type === "products" ? event.part : { type: "text", text: event.text };

          this.update({
            preview: { ...this.state.preview, parts: appendDelta(this.state.preview.parts, part) },
          });
        }
      }

      if (!terminal && this.state.preview)
        this.update({ preview: { ...this.state.preview, unsaved: true } });
    } catch (cause) {
      if (signal.aborted) return;
      this.update({
        notice: notice(cause),
        preview: this.state.preview ? { ...this.state.preview, unsaved: true } : null,
      });
    } finally {
      if (id && !signal.aborted) {
        try {
          await this.reconcile(id, signal);

          if (!accepted && this.state.history?.turns.some((t) => t.turnId === turnId)) {
            this.pendingSend = null;

            if (!attempt) this.update({ draft: "" });
          }

          if (this.state.preview && !this.state.preview.parts.length)
            this.update({ preview: null });
        } catch (cause) {
          if (!signal.aborted)
            this.update({
              notice: notice(cause),
              preview: this.state.preview ? { ...this.state.preview, unsaved: true } : null,
            });
        }
      }

      if (!signal.aborted) this.update({ busy: false });
    }
  }
}

function notice(cause: unknown) {
  return cause instanceof RequestProblem
    ? cause.message
    : "Couldn’t confirm the saved chat. Check the connection and try again.";
}

function cryptoId() {
  return globalThis.crypto.randomUUID();
}

function appendDelta(parts: MessagePart[], part: MessagePart): MessagePart[] {
  const last = parts.at(-1);

  if (last?.type === "text" && part.type === "text")
    return [...parts.slice(0, -1), { type: "text", text: last.text + part.text }];

  return [...parts, part];
}
