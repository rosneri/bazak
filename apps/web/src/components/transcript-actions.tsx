import { useState } from "react";
import { Button } from "@bazak/ui/components/button";
import type { ConversationHistory } from "@bazak/conversation/domain/turn";
import { transcriptMarkdown } from "./transcript-markdown";

export function TranscriptActions({
  history,
  busy,
}: {
  history: ConversationHistory;
  busy: boolean;
}) {
  const [notice, setNotice] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(transcriptMarkdown(history));
      setNotice("Conversation copied.");
    } catch {
      setNotice("Clipboard unavailable. Use Export to save the conversation.");
    }
  }

  function download() {
    const blob = new Blob([transcriptMarkdown(history)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shopping-chat-${history.conversation.id}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <div className="transcript-actions">
        <Button variant="outline" disabled={busy} onClick={copy}>
          Copy
        </Button>
        <Button variant="outline" disabled={busy} onClick={download}>
          Export
        </Button>
      </div>
      {notice && (
        <span className="export-notice" role="status">
          {notice}
        </span>
      )}
    </>
  );
}
