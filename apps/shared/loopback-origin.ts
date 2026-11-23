export function getLoopbackOrigin(headers: Headers, port: string): string | null {
  const host = headers.get("host")?.toLowerCase();
  const suffix = port === "80" ? "" : ":" + port;

  if (host === "127.0.0.1" + suffix || host === "localhost" + suffix) return "http://" + host;

  return null;
}
