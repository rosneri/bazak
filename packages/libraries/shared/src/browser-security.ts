const policyHeader = "Content-Security-Policy";

export const browserSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

export function documentPolicy(origin: string, dev: boolean, imageOrigin = "") {
  const nonce = crypto.randomUUID();
  const inlineStyle = dev ? "'unsafe-inline'" : `'nonce-${nonce}'`;
  const devEval = dev ? " 'unsafe-eval'" : "";
  const devSocket = dev ? " " + origin.replace(/^http:/, "ws:") : "";
  const images = imageOrigin ? " " + imageOrigin : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "script-src-attr 'none'",
    `style-src 'self' ${inlineStyle}`,
    `img-src 'self'${images}`,
    `connect-src 'self'${devSocket}`,
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function documentRequestHeaders(request: Request, policy: string) {
  const headers = new Headers(request.headers);
  headers.set(policyHeader, policy);

  return headers;
}

export function secureDocument(response: Response, policy: string) {
  response.headers.set(policyHeader, policy);
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
