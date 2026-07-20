import { drizzle as drizzleNetlify } from "drizzle-orm/netlify-db";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

function createDb() {
  // Netlify-hosted DB (auto-provisioned when @netlify/database is installed)
  if (process.env.NETLIFY_DATABASE_URL || process.env.NETLIFY_DB_URL) {
    return drizzleNetlify({ schema });
  }

  // Local / CI Postgres
  if (process.env.DATABASE_URL) {
    return drizzlePostgres(process.env.DATABASE_URL, { schema });
  }

  // Netlify Functions runtime often exposes connection via the adapter alone
  if (process.env.NETLIFY) {
    return drizzleNetlify({ schema });
  }

  return null;
}

export const db = createDb();

export function dbConfigured() {
  return Boolean(db);
}
