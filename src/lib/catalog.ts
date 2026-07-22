import { ilike, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { catalogTracks } from "../../db/schema";
import { CATALOG_SEED, type CatalogTrack } from "./catalog-data";
import { searchItunes } from "./itunes";

export type { CatalogTrack };

export type CatalogSearchSource = "itunes" | "database" | "seed";

function mapRow(row: typeof catalogTracks.$inferSelect): CatalogTrack {
  return {
    id: row.id,
    title: row.title,
    artists: row.artists,
    album: row.album,
    year: row.year,
    genre: row.genre,
    albumArt: row.albumArt,
    durationMs: row.durationMs,
    externalId: row.externalId,
  };
}

/** In-memory fallback when DB / iTunes aren't available. */
function searchSeed(query: string, limit: number): CatalogTrack[] {
  const q = query.trim().toLowerCase();
  const rows = !q
    ? CATALOG_SEED
    : CATALOG_SEED.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artists.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q) ||
          String(t.year).includes(q),
      );
  return rows.slice(0, limit).map((t, i) => ({
    id: `seed-${i}-${t.title}`,
    title: t.title,
    artists: t.artists,
    album: t.album,
    year: t.year,
    genre: t.genre,
    albumArt: t.albumArt,
    durationMs: t.durationMs,
    externalId: t.externalId ?? null,
  }));
}

async function searchLocalDatabase(
  query: string,
  limit: number,
): Promise<{ tracks: CatalogTrack[]; source: "database" | "seed" }> {
  if (!db) {
    return { tracks: searchSeed(query, limit), source: "seed" };
  }

  const q = query.trim();
  try {
    if (!q) {
      const rows = await db
        .select()
        .from(catalogTracks)
        .orderBy(sql`${catalogTracks.title} asc`)
        .limit(limit);
      if (rows.length === 0) {
        return { tracks: searchSeed(query, limit), source: "seed" };
      }
      return { tracks: rows.map(mapRow), source: "database" };
    }

    const pattern = `%${q}%`;
    const rows = await db
      .select()
      .from(catalogTracks)
      .where(
        or(
          ilike(catalogTracks.title, pattern),
          ilike(catalogTracks.artists, pattern),
          ilike(catalogTracks.album, pattern),
          ilike(catalogTracks.genre, pattern),
          sql`cast(${catalogTracks.year} as text) ilike ${pattern}`,
        ),
      )
      .orderBy(sql`${catalogTracks.title} asc`)
      .limit(limit);

    if (rows.length === 0) {
      const seeded = searchSeed(query, limit);
      return {
        tracks: seeded,
        source: seeded.length ? "seed" : "database",
      };
    }

    return { tracks: rows.map(mapRow), source: "database" };
  } catch (err) {
    console.error("catalog search failed", err);
    return { tracks: searchSeed(query, limit), source: "seed" };
  }
}

/**
 * Search songs for nomination.
 * - Empty query: browse local Render DB catalog (or seed).
 * - With query: iTunes Search API first (no key), then local fallback.
 */
export async function searchCatalog(
  query: string,
  limit = 20,
): Promise<{ tracks: CatalogTrack[]; source: CatalogSearchSource }> {
  const q = query.trim();

  if (q) {
    try {
      const itunes = await searchItunes(q, limit);
      if (itunes.length > 0) {
        return { tracks: itunes, source: "itunes" };
      }
    } catch (err) {
      console.error("iTunes search failed, falling back to local catalog", err);
    }
  }

  return searchLocalDatabase(query, limit);
}
