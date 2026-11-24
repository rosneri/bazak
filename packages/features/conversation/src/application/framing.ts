import { bounded } from "#application/deadline";

export const SAFE_FRAMING = [
  "Here’s what I found.",
  "Would you like to narrow the search?",
] as const;

// Release only prefixes of approved sentences. A changed prefix after publication fails
// the attempt so the saved answer can never disagree with what the shopper saw.
export async function* approvedFraming(stream: AsyncIterable<string>, signal: AbortSignal) {
  const iterator = stream[Symbol.asyncIterator]();
  const emitted = new Set<string>();
  let sentence = "";
  let visible = 0;

  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Preserve provider order.
      const chunk = await bounded(() => iterator.next(), signal);

      if (chunk.done) {
        if (visible) throw new Error("Incomplete reply sentence.");

        return;
      }

      for (const segment of chunk.value.match(/[^.!?]*[.!?]|[^.!?]+$/gu) ?? []) {
        sentence = (sentence + segment).trimStart().slice(0, 121);

        const phrase = SAFE_FRAMING.find(
          (value) => !emitted.has(value) && value.startsWith(sentence),
        );

        if (visible && !phrase) throw new Error("Reply diverged from approved framing.");
        const end = sentence.trimEnd().length;

        if (phrase && end > visible) {
          const separator = emitted.size && !visible ? " " : "";
          yield separator + sentence.slice(visible, end);
          visible = end;
        }

        if (/[.!?]$/u.test(segment)) {
          if (phrase === sentence) emitted.add(phrase);
          sentence = "";
          visible = 0;
        }
      }
    }
  } finally {
    void iterator.return?.().catch(() => {});
  }
}
