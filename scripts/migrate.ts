import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import path from "path";
import postgres from "postgres";

/**
 * Applies SQL migrations from drizzle/<id>/migration.sql (sorted by folder name).
 * Idempotent for redeploys via okaylist_migrations tracking table.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required for migrations");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false });

  await sql`
    CREATE TABLE IF NOT EXISTS okaylist_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const root = path.join(process.cwd(), "drizzle");
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const id of entries) {
    const already = await sql`
      SELECT 1 FROM okaylist_migrations WHERE id = ${id} LIMIT 1
    `;
    if (already.length > 0) {
      console.log(`skip ${id}`);
      continue;
    }

    const file = path.join(root, id, "migration.sql");
    const body = await readFile(file, "utf8");
    const statements = body
      .split(/--> statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);

    console.log(`apply ${id} (${statements.length} statements)`);
    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Tolerate re-runs against a DB that already has older tables/types.
        if (
          /already exists/i.test(message) ||
          /duplicate_object/i.test(message) ||
          /already present/i.test(message) ||
          message.includes("42710") ||
          message.includes("42P07")
        ) {
          console.warn(`  tolerate: ${message.split("\n")[0]}`);
          continue;
        }
        throw err;
      }
    }

    await sql`INSERT INTO okaylist_migrations (id) VALUES (${id})`;
  }

  await sql.end();
  console.log("Migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
