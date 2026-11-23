import { bounded } from "#application/deadline";

export const SAFE_FRAMING = [
  "Here’s what I found.",
  "Would you like to narrow the search?",
] as const;

// A sentence can cross provider chunks. Inspect every completed sentence before releasing it.
// Keep consuming after the two approved sentences so a truncated stream still fails the attempt.
export async function* approvedFraming(stream: AsyncIterable<string>, signal: AbortSignal) {
  const iterator = stream[Symbol.asyncIterator]();
  const emitted = new Set<string>();
  let sentence = "";
  let oversized = false;

  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- The provider owns chunk order.
      const chunk = await bounded(() => iterator.next(), signal);

      if (chunk.done) return;

      if (emitted.size === SAFE_FRAMING.length) continue;

      for (const character of chunk.value) {
        if (!oversized) sentence += character;

        if (sentence.length > 120) oversized = true;

        if (!".!?".includes(character)) continue;
        const phrase = SAFE_FRAMING.find((allowed) => !oversized && allowed === sentence.trim());
        sentence = "";
        oversized = false;

        if (phrase && !emitted.has(phrase)) {
          const delta = emitted.size ? " " + phrase : phrase;
          emitted.add(phrase);
          yield delta;
        }
      }
    }
  } finally {
    void iterator.return?.().catch(() => {});
  }
}
