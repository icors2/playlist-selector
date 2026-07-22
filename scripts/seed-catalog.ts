import "dotenv/config";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { catalogTracks } from "../db/schema";
import { CATALOG_SEED } from "../src/lib/catalog-data";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required for seeding");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle({ client });

  for (const track of CATALOG_SEED) {
    await db
      .insert(catalogTracks)
      .values({
        title: track.title,
        artists: track.artists,
        album: track.album,
        year: track.year,
        genre: track.genre,
        albumArt: track.albumArt,
        durationMs: track.durationMs,
        externalId: track.externalId ?? null,
      })
      .onConflictDoNothing();
  }

  const [row] = await db.select({ count: count() }).from(catalogTracks);
  console.log(`Catalog ready — ${row.count} tracks in database`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
