import type { FormEvent } from "react";
import { Button } from "@bazak/ui/components/button";
import type { ShoppingSession } from "../client/chat-session";

export function ChatComposer({
  session,
  composer,
  onSubmit,
}: {
  session: ShoppingSession;
  composer: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { busy, draft, loading, setDraft } = session;

  return (
    <div className="composer-dock">
      <form className="composer" onSubmit={onSubmit}>
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
        <Button type="submit" className="send" disabled={busy || loading || !draft.trim()}>
          Send <span aria-hidden="true">↑</span>
        </Button>
      </form>
    </div>
  );
}
