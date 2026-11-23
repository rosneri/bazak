// Adapters receive the signal too. The race enforces the lease even when a dependency stalls.
export async function bounded<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let rejectAbort: () => void = () => {};

  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(signal.reason);
    signal.addEventListener("abort", rejectAbort, { once: true });
  });

  try {
    return await Promise.race([operation(), aborted]);
  } finally {
    signal.removeEventListener("abort", rejectAbort);
  }
}

export function stageSignal(parent: AbortSignal, ms: number) {
  return AbortSignal.any([parent, AbortSignal.timeout(ms)]);
}
