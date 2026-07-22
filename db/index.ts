import { drizzle as drizzleNetlify } from "drizzle-orm/netlify-db";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  // Render / local / any Postgres URL (preferred)
  if (process.env.DATABASE_URL) {
    const client = postgres(process.env.DATABASE_URL, {
      max: 5,
      prepare: false,
      // Free Render DB can be slow to accept the first connection.
      connect_timeout: 30,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
    });
    return drizzlePostgres({ client, schema });
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
