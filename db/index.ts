import { drizzle as drizzleNetlify } from "drizzle-orm/netlify-db";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

function createDb() {
  // Render / local / any Postgres URL (preferred)
  if (process.env.DATABASE_URL) {
    return drizzlePostgres(process.env.DATABASE_URL, { schema });
  }

  // Netlify Database fallback
  if (process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL) {
    return drizzleNetlify({ schema });
  }

  if (process.env.NETLIFY) {
    return drizzleNetlify({ schema });
  }

  return null;
}

export const db = createDb();

export function dbConfigured() {
  return Boolean(db);
}
