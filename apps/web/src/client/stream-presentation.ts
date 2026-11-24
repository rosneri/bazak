import type { MessagePart } from "@bazak/conversation/domain/turn";

// Provider chunks can contain a single token or a whole paragraph. Pace only
// batched text. A saved transcript or reduced-motion preview appears immediately.
export async function* revealText(text: string, signal: AbortSignal) {
  const instant = document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const chunks = instant ? [text] : (text.match(/\s*\S+\s*|\s+/gu) ?? []);

  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) {
      // oxlint-disable-next-line no-await-in-loop -- Allow each fragment to paint.
      await new Promise<void>((resolve) => setTimeout(resolve, 24));
    }

    signal.throwIfAborted();
    yield chunk;
  }
}

export function appendDelta(parts: MessagePart[], text: string): MessagePart[] {
  const last = parts.at(-1);

  if (last?.type === "text")
    return [...parts.slice(0, -1), { type: "text", text: last.text + text }];

  return [...parts, { type: "text", text }];
}
