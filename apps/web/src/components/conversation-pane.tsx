import { TranscriptActions } from "./transcript-actions";
import { ProductSkeleton } from "./product-skeleton";
import { TurnDiagnostics } from "./turn-diagnostics";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@bazak/ui/components/button";
import { AssistantParts } from "./product-card";
import type { Turn } from "@bazak/conversation/domain/turn";
import type { ShoppingSession } from "../client/chat-session";

const examples = ["Two fragrances under $50", "Find a desk lamp"];

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
      <TurnDiagnostics turn={turn} />
    </article>
  );
}

function Transcript({ session }: { session: ShoppingSession }) {
  const { history, preview, retry, busy } = session;
  const empty = !history?.turns.length && !preview;

  return (
    <>
      {!empty && (
        <header className="conversation-header">
          <h1 className="conversation-heading">
            {history?.conversation.title === "New chat"
              ? "Shopping chat"
              : (history?.conversation.title ?? "Shopping chat")}
          </h1>
          {history && <TranscriptActions history={history} busy={busy} />}
        </header>
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
          {preview.pendingLabel && <ProductSkeleton label={preview.pendingLabel} />}
          <p role="status" className="status">
            {preview.unsaved ? "Unsaved preview" : "Reply in progress…"}
          </p>
        </article>
      )}
    </>
  );
}

function WelcomeSuggestions({
  selectExample,
  disabled,
}: {
  selectExample: (text: string) => void;
  disabled: boolean;
}) {
  return (
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
            onClick={() => selectExample(example)}
            disabled={disabled}
          >
            {example}
            <span aria-hidden="true">↗</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ConversationPane({
  session,
  selectExample,
  transcript,
  trackScroll,
}: {
  session: ShoppingSession;
  selectExample: (text: string) => void;
  transcript: React.RefObject<HTMLDivElement | null>;
  trackScroll: React.UIEventHandler<HTMLDivElement>;
}) {
  const { busy, inaccessible, loading, notice, history, preview } = session;
  const empty = !history?.turns.length && !preview;

  return (
    <div className="transcript" ref={transcript} onScroll={trackScroll}>
      <div className="conversation">
        {loading && (
          <p role="status" className="status">
            Opening the shopping desk…
          </p>
        )}
        {!loading && !inaccessible && empty && (
          <WelcomeSuggestions selectExample={selectExample} disabled={busy} />
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
  );
}

export function useTranscriptScroll() {
  const transcript = useRef<HTMLDivElement>(null);
  const readingEnd = useRef(true);
  useEffect(function followTranscriptGrowth() {
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

  function trackScroll(event: React.UIEvent<HTMLDivElement>) {
    const pane = event.currentTarget;
    readingEnd.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 90;
  }

  function followNextReply() {
    readingEnd.current = true;
  }

  return { transcript, trackScroll, followNextReply };
}
