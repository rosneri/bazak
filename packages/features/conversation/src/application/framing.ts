import { bounded } from "#application/deadline";

export const SAFE_FRAMING = ["Here’s what I found.", "Let’s take a look."] as const;

// A provider may split a phrase at any character. Only complete allowed phrases reach the UI.
// Continue consuming after the approved phrase so a truncated provider response fails the attempt.
export async function* approvedFraming(stream: AsyncIterable<string>, signal: AbortSignal) {
  const iterator = stream[Symbol.asyncIterator]();
  let buffer = "";
  let emitted = false;

  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Poll one provider chunk at a time.
      const chunk = await bounded(() => iterator.next(), signal);

      if (chunk.done) return;

      if (emitted || buffer.length > 120) continue;
      buffer += chunk.value.slice(0, 121);
      const phrase = SAFE_FRAMING.find((candidate) => candidate === buffer.trim());

      if (phrase) {
        emitted = true;
        yield phrase;
      }
    }
  } finally {
    void iterator.return?.().catch(() => {});
  }
}
