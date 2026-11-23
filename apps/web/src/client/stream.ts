import { turnEventSchema, type TurnEvent } from "@bazak/conversation/domain/turn";

export async function* readTurnStream(response: Response): AsyncGenerator<TurnEvent> {
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get("Content-Type")?.startsWith("text/event-stream")
  )
    throw new Error("The server did not return a reply stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- SSE bytes must be consumed in order.
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary = buffer.match(/\r?\n\r?\n/);

      while (boundary?.index !== undefined) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);

        const lines = frame
          .split(/\r?\n/)
          .flatMap((line) => (line.startsWith("data:") ? [line.slice(5).trimStart()] : []));

        if (lines.length) yield turnEventSchema.parse(JSON.parse(lines.join("\n")));
        boundary = buffer.match(/\r?\n\r?\n/);
      }

      if (buffer.length > 1024 * 1024) throw new Error("The reply frame is too large.");

      if (done) break;
    }

    if (buffer.trim()) throw new Error("The reply stream was interrupted.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
