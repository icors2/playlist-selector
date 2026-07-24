import { ilike, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { catalogTracks } from "../../db/schema";
import { CATALOG_SEED, type CatalogTrack } from "./catalog-data";
import { searchItunes } from "./itunes";
import { searchSpotifyCatalog, spotifyConfigured } from "./spotify";

export type { CatalogTrack };

export type CatalogSearchSource = "spotify" | "itunes" | "database" | "seed";

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

/** In-memory fallback when DB / Spotify / iTunes aren't available. */
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
 * - With query: Spotify (primary) → iTunes (backup) → local catalog.
 */
export async function searchCatalog(
  query: string,
  limit = 20,
): Promise<{
  tracks: CatalogTrack[];
  source: CatalogSearchSource;
  spotifyError?: string;
}> {
  const q = query.trim();

  if (q) {
    if (spotifyConfigured()) {
      try {
        // Cap Spotify page size — large limits have been flaky with
        // Client Credentials on some apps.
        const spotify = await searchSpotifyCatalog(q, Math.min(limit, 20));
        if (spotify.length > 0) {
          return { tracks: spotify, source: "spotify" };
        }
      } catch (err) {
        const spotifyError =
          err instanceof Error ? err.message : "Spotify search failed";
        console.error("Spotify search failed, falling back to iTunes", err);

        try {
          const itunes = await searchItunes(q, limit);
          if (itunes.length > 0) {
            return { tracks: itunes, source: "itunes", spotifyError };
          }
        } catch (itunesErr) {
          console.error(
            "iTunes search failed, falling back to local catalog",
            itunesErr,
          );
        }

        const local = await searchLocalDatabase(query, limit);
        return { ...local, spotifyError };
      }
    }

    try {
      const itunes = await searchItunes(q, limit);
      if (itunes.length > 0) {
        return { tracks: itunes, source: "itunes" };
      }
    } catch (err) {
      console.error(
        "iTunes search failed, falling back to local catalog",
        err,
      );
    }
  }

  return searchLocalDatabase(query, limit);
}
