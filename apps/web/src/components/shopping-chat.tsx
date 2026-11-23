"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent } from "react";
import { Button } from "@bazak/ui/components/button";
import { useShoppingSession } from "../client/chat-session";
import { AssistantParts } from "./product-card";
import type { Turn } from "@bazak/conversation/domain/turn";

const examples = ["Two fragrances under $50", "Find a desk lamp"];

type ShoppingSession = ReturnType<typeof useShoppingSession>;

interface HomeRoute {
  pathname: string;
  session: number;
  createdPath: string | null;
}

const activityDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function TranscriptTurn({
  turn,
  retry,
  busy,
}: {
  turn: Turn;
  retry: (turn: Turn) => void;
  busy: boolean;
}) {
  return (
    <article className="exchange">
      <p className="user-message">{turn.text}</p>
      {turn.assistant && <AssistantParts parts={turn.assistant.parts} />}
      {turn.state === "running" && (
        <p className="status" role="status">
          Reply in progress…
        </p>
      )}
      {(turn.state === "failed" || turn.state === "interrupted") && (
        <div className="retry">
          <p>
            Attempt {turn.attempt} {turn.state}. You can retry this message.
          </p>
          <Button variant="outline" disabled={busy} onClick={() => retry(turn)}>
            Retry reply
          </Button>
        </div>
      )}
    </article>
  );
}

function Transcript({ session }: { session: ShoppingSession }) {
  const { history, preview, retry, busy } = session;
  const empty = !history?.turns.length && !preview;

  return (
    <>
      {!empty && (
        <h1 className="conversation-heading">
          {history?.conversation.title === "New chat"
            ? "Shopping chat"
            : (history?.conversation.title ?? "Shopping chat")}
        </h1>
      )}
      {history?.turns.map((turn) =>
        preview?.turnId === turn.turnId && !preview.unsaved ? null : (
          <TranscriptTurn key={turn.turnId} turn={turn} retry={retry} busy={busy} />
        ),
      )}
      {preview && (
        <article className="exchange preview" aria-label="Reply preview">
          {!history?.turns.some((t) => t.turnId === preview.turnId && preview.unsaved) && (
            <p className="user-message">{preview.text}</p>
          )}
          <AssistantParts parts={preview.parts} />
          <p role="status" className="status">
            {preview.unsaved ? "Unsaved preview" : "Reply in progress…"}
          </p>
        </article>
      )}
    </>
  );
}

function SavedChats({ session, menu }: { session: ShoppingSession; menu: boolean }) {
  const { busy, id, list, listLoading, newChat } = session;

  return (
    <aside id="chat-history" className={menu ? "sidebar open" : "sidebar"}>
      <div className="sidebar-top">
        <h2>Saved chats</h2>
        <Button variant="outline" onClick={newChat} disabled={busy} className="new-chat">
          <span aria-hidden="true">＋</span> New chat
        </Button>
      </div>
      <nav aria-label="Chat history">
        {list.map((chat) => (
          <Link
            href={"/conversations/" + chat.id}
            key={chat.id}
            aria-current={chat.id === id ? "page" : undefined}
          >
            <span>{chat.title}</span>
            <time dateTime={chat.updatedAt}>{activityDate.format(new Date(chat.updatedAt))}</time>
          </Link>
        ))}
      </nav>
      {!list.length && (
        <p className="sidebar-note">
          {listLoading ? "Loading chats…" : "Your conversations will appear here."}
        </p>
      )}
    </aside>
  );
}

export function ShoppingChat({ initialId }: { initialId: string | null }) {
  return initialId === null ? <HomeShoppingChat /> : <ShoppingDesk initialId={initialId} />;
}

function HomeShoppingChat() {
  const pathname = usePathname();
  const [route, setRoute] = useState<HomeRoute>({ pathname, session: 0, createdPath: null });

  // The home route can stay mounted when Next restores its history entry.
  if (pathname !== route.pathname)
    setRoute({
      pathname,
      session: pathname === route.createdPath ? route.session : route.session + 1,
      createdPath: null,
    });

  function openCreatedConversation(id: string) {
    const createdPath = "/conversations/" + id;
    setRoute((current) => ({ ...current, createdPath }));
    window.history.replaceState(null, "", createdPath);
  }

  const id = pathname.match(/^\/conversations\/([^/]+)$/)?.[1] ?? null;

  return <ShoppingDesk key={route.session} initialId={id} onCreate={openCreatedConversation} />;
}

function ShoppingDesk({
  initialId,
  onCreate,
}: {
  initialId: string | null;
  onCreate?: (id: string) => void;
}) {
  const session = useShoppingSession(initialId, onCreate);
  const [menu, setMenu] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const readingEnd = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const pane = transcript.current;

    if (!pane) return;
    const content = pane.firstElementChild;

    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (readingEnd.current) pane.scrollTop = pane.scrollHeight;
    });

    observer.observe(content);

    return () => observer.disconnect();
  }, []);
  const { busy, draft, history, inaccessible, loading, notice, preview, setDraft } = session;
  const empty = !history?.turns.length && !preview;
  const blocked = busy || loading || inaccessible;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    readingEnd.current = true;
    void session.send();
  }

  return (
    <div className="shop-shell">
      <header className="masthead">
        <Link className="brand" href="/" aria-label="Bazak home">
          <span className="brand-mark" aria-hidden="true">
            b
          </span>
          Bazak
        </Link>
        <span className="mast-divider" />
        <span className="mast-title">Shopping desk</span>
        <Button
          variant="outline"
          className="history-toggle"
          aria-controls="chat-history"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? "Close history" : "History"}
        </Button>
      </header>
      <SavedChats menu={menu} session={session} />
      <main className="workspace">
        <div
          className="transcript"
          ref={transcript}
          onScroll={(e) => {
            const el = e.currentTarget;
            readingEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
          }}
        >
          <div className="conversation">
            {loading && (
              <p role="status" className="status">
                Opening the shopping desk…
              </p>
            )}
            {!loading && !inaccessible && empty && (
              <div className="welcome">
                <span className="welcome-mark" aria-hidden="true">
                  b
                </span>
                <h1>What are you looking for?</h1>
                <p>Find products, compare prices, or ask about a previous find.</p>
                <div className="suggestions">
                  {examples.map((example) => (
                    <Button
                      key={example}
                      variant="outline"
                      onClick={() => {
                        setDraft(example);
                        composer.current?.focus();
                      }}
                      disabled={blocked}
                    >
                      {example}
                      <span aria-hidden="true">↗</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <Transcript session={session} />
            {notice && (
              <div role="alert" className="notice">
                <p>{notice}</p>
                <Button variant="link" onClick={session.reload} disabled={busy}>
                  Refresh chat
                </Button>
                {inaccessible && <Link href="/">Return to history</Link>}
              </div>
            )}
          </div>
        </div>
        {!inaccessible && (
          <div className="composer-dock">
            <form className="composer" onSubmit={submit}>
              <label className="sr-only" htmlFor="shopper-message">
                Message the shopping assistant
              </label>
              <textarea
                ref={composer}
                rows={2}
                disabled={loading}
                id="shopper-message"
                maxLength={4000}
                placeholder="Ask about a product…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <Button type="submit" className="send" disabled={blocked || !draft.trim()}>
                Send <span aria-hidden="true">↑</span>
              </Button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
