import type { RequestPolicyErrorCode } from "../api/generated/models.ts";

export class RequestError extends Error {
  constructor(readonly code: "invalid_input" | RequestPolicyErrorCode) {
    super(code);
  }
}

// Leave room for JSON escapes, UTF-8 and envelope fields at the shopper text limit.
const maxBodyBytes = 64 * 1024;

const bodyTimeoutMs = 10_000;

const jsonMediaType = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i;

export function verifyWriteOrigin(headers: Headers, targetOrigin: string) {
  const site = headers.get("Sec-Fetch-Site");

  if (site === "same-site" || site === "cross-site" || site === "none")
    throw new RequestError("forbidden_origin");

  const origin = headers.get("Origin");
  const referrer = headers.get("Referer");

  // JSON-only writes without a CORS grant let direct clients omit browser headers.
  if (
    (origin !== null && origin !== targetOrigin) ||
    (origin === null && referrer !== null && URL.parse(referrer)?.origin !== targetOrigin)
  )
    throw new RequestError("forbidden_origin");
}

export async function readJsonBody(request: Request) {
  const contentType = request.headers.get("Content-Type");
  const encoding = request.headers.get("Content-Encoding");

  if (
    !contentType ||
    !jsonMediaType.test(contentType) ||
    (encoding !== null && encoding.toLowerCase() !== "identity")
  )
    throw new RequestError("unsupported_media_type");

  const contentLength = request.headers.get("Content-Length");

  if (contentLength !== null && !/^\d+$/.test(contentLength))
    throw new RequestError("invalid_input");

  const declaredBytes = contentLength === null ? null : Number(contentLength);

  if (declaredBytes !== null && declaredBytes > maxBodyBytes)
    throw new RequestError("payload_too_large");

  if (!request.body) throw new RequestError("invalid_input");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const deadline = new AbortController();
  const signal = AbortSignal.any([request.signal, deadline.signal]);

  const timer = setTimeout(
    () => deadline.abort(new RequestError("request_timeout")),
    bodyTimeoutMs,
  );

  let bytes = 0;
  let text = "";

  function cancelRead() {
    void reader.cancel().catch(() => {});
  }

  signal.addEventListener("abort", cancelRead, { once: true });

  try {
    signal.throwIfAborted();

    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Count each chunk before requesting another.
      const { done, value } = await reader.read();
      signal.throwIfAborted();

      if (done) break;

      bytes += value.byteLength;

      if (bytes > maxBodyBytes) throw new RequestError("payload_too_large");

      text += decoder.decode(value, { stream: true });
    }

    if (declaredBytes !== null && declaredBytes !== bytes) throw new RequestError("invalid_input");

    return text + decoder.decode();
  } catch (cause) {
    cancelRead();
    signal.throwIfAborted();

    if (cause instanceof RequestError) throw cause;

    throw new RequestError("invalid_input");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancelRead);
    reader.releaseLock();
  }
}
