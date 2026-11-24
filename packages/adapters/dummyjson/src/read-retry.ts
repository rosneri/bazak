import { setTimeout as delay } from "node:timers/promises";
import { remainingCatalogTime } from "@bazak/product-discovery/application/catalog";

const retryableStatuses = new Set([429, 500, 502, 503, 504]);

export class CatalogHttpError extends Error {
  readonly response: Response;

  constructor(response: Response) {
    super(`DummyJSON catalog request failed with HTTP ${response.status}.`);
    this.response = response;
  }
}

function retryDelay(response: Response) {
  const value = response.headers.get("Retry-After")?.trim();

  if (!value) return 100;

  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);

  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 100;
}

function isConnectionFailure(error: Error) {
  // Fetch wraps transport errors (including a reset during body consumption) in TypeError.
  const cause = error.cause;

  if (!(error instanceof TypeError)) return false;

  if (cause === undefined) return true;

  return (
    cause instanceof Error &&
    "code" in cause &&
    [
      "EAI_AGAIN",
      "ENOTFOUND",
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ].includes(String(cause.code))
  );
}

export async function readWithRetry<T>(read: () => Promise<T>, signal?: AbortSignal) {
  signal?.throwIfAborted();

  try {
    return await read();
  } catch (error) {
    signal?.throwIfAborted();

    if (!(error instanceof Error)) throw error;

    const wait =
      error instanceof CatalogHttpError && retryableStatuses.has(error.response.status)
        ? retryDelay(error.response)
        : isConnectionFailure(error)
          ? 100
          : null;

    if (wait === null || wait >= remainingCatalogTime(signal)) throw error;

    await delay(wait, undefined, { signal });
    signal?.throwIfAborted();

    return read();
  }
}
