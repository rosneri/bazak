export function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const url = new URL("postgresql://bazak@127.0.0.1/bazak");
  url.password = process.env.POSTGRES_PASSWORD ?? "bazak_local";
  url.port = process.env.POSTGRES_PORT ?? "55432";

  return url.toString();
}
