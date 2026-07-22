import type { CatalogTrack } from "./catalog-data";

type ItunesSong = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
  releaseDate?: string;
  kind?: string;
};

function largerArtwork(url: string | undefined) {
  if (!url) return null;
  // iTunes serves size variants via the filename suffix.
  return url.replace(/100x100bb\.(jpg|png)$/i, "300x300bb.$1");
}

function mapItunesTrack(track: ItunesSong): CatalogTrack {
  const year = track.releaseDate
    ? Number(track.releaseDate.slice(0, 4)) || null
    : null;

  return {
    id: `itunes-${track.trackId}`,
    title: track.trackName,
    artists: track.artistName,
    album: track.collectionName ?? null,
    year,
    genre: track.primaryGenreName ?? null,
    albumArt: largerArtwork(track.artworkUrl100),
    durationMs: track.trackTimeMillis ?? 0,
    externalId: `itunes:${track.trackId}`,
    previewUrl: track.previewUrl ?? null,
  };
}

/**
 * Live song search via Apple's public iTunes Search API.
 * No API key required: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 */
export async function searchItunes(
  query: string,
  limit = 20,
): Promise<CatalogTrack[]> {
  const term = query.trim();
  if (!term) return [];

  const params = new URLSearchParams({
    term,
    media: "music",
    entity: "song",
    limit: String(Math.min(50, Math.max(1, limit))),
  });

  const res = await fetch(`https://itunes.apple.com/search?${params}`, {
    headers: { Accept: "application/json" },
    // iTunes can be slow; don't hang the nominate UI forever.
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`iTunes search failed (${res.status})`);
  }

  const data = (await res.json()) as { results?: ItunesSong[] };
  const songs = (data.results ?? []).filter(
    (r) => r.kind === "song" && r.trackId && r.trackName && r.artistName,
  );

  // Dedupe by title+artist (iTunes often returns multiple editions).
  const seen = new Set<string>();
  const tracks: CatalogTrack[] = [];
  for (const song of songs) {
    const key = `${song.trackName.toLowerCase()}::${song.artistName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push(mapItunesTrack(song));
  }
  return tracks;
}
