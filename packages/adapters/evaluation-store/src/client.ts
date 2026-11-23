import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.ts";
import { databaseUrl } from "./database-url.ts";

export const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl(), max: 3, connectionTimeoutMillis: 3000 }),
});
