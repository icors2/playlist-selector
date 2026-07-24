import type { CatalogTrack } from "./catalog-data";
import {
  DEMO_TRACKS,
  searchDemoTracks,
  type TrackResult,
} from "./demo-tracks";

const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
const SPOTIFY_API = "https://api.spotify.com/v1";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

const globalSpotify = globalThis as unknown as {
  spotifyAppToken?: TokenCache;
};

export function spotifyConfigured() {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET,
  );
}

/** Public site origin for redirects (Render / reverse proxies). */
export function publicAppBase(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host =
    forwardedHost ||
    request.headers.get("host") ||
    new URL(request.url).host;

  let proto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (!proto) {
    proto =
      host.includes("localhost") || host.startsWith("127.") ? "http" : "https";
  }
  // TLS terminates at the edge on Render.
  if (host.endsWith(".onrender.com")) proto = "https";

  return `${proto}://${host}`;
}

/** Must match Spotify Dashboard redirect URI exactly. */
export function spotifyRedirectUri(request: Request): string {
  return `${publicAppBase(request)}/api/spotify/export`;
}

export const SPOTIFY_REDIRECT_COOKIE = "spotify_oauth_redirect";

async function getAppAccessToken(): Promise<string | null> {
  if (!spotifyConfigured()) return null;

  const cached = globalSpotify.spotifyAppToken;
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("Spotify token error", await res.text());
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  globalSpotify.spotifyAppToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

function mapTrack(track: {
  id: string;
  name: string;
  artists: { name: string }[];
  album?: { images?: { url: string }[] };
  preview_url: string | null;
  duration_ms: number;
  uri: string;
}): TrackResult {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map((a) => a.name).join(", "),
    albumArt: track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url ?? null,
    previewUrl: track.preview_url,
    durationMs: track.duration_ms,
    uri: track.uri,
  };
}

type SpotifySearchItem = {
  id: string;
  name: string;
  artists: { name: string }[];
  album?: {
    name?: string;
    release_date?: string;
    images?: { url: string }[];
  };
  preview_url: string | null;
  duration_ms: number;
  uri: string;
};

function yearFromReleaseDate(date: string | undefined): number | null {
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/**
 * Spotify Search via Client Credentials (no user login).
 * Throws when credentials are missing or the API fails — callers can fall back.
 */
export async function searchSpotifyCatalog(
  query: string,
  limit = 20,
): Promise<CatalogTrack[]> {
  const term = query.trim();
  if (!term) return [];

  const token = await getAppAccessToken();
  if (!token) {
    throw new Error("Spotify credentials are not configured");
  }

  const params = new URLSearchParams({
    q: term,
    type: "track",
    limit: String(Math.min(50, Math.max(1, limit))),
  });

  const res = await fetch(`${SPOTIFY_API}/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Spotify search failed (${res.status}) ${body.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    tracks?: { items?: SpotifySearchItem[] };
  };

  const seen = new Set<string>();
  const tracks: CatalogTrack[] = [];
  for (const track of data.tracks?.items ?? []) {
    if (!track?.id || !track.name) continue;
    const artists = (track.artists ?? []).map((a) => a.name).join(", ");
    const key = `${track.name.toLowerCase()}::${artists.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push({
      id: `spotify-${track.id}`,
      title: track.name,
      artists,
      album: track.album?.name ?? null,
      year: yearFromReleaseDate(track.album?.release_date),
      genre: null,
      albumArt:
        track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url ?? null,
      durationMs: track.duration_ms ?? 0,
      // Bare Spotify track id — used for playlist export.
      externalId: track.id,
      previewUrl: track.preview_url,
    });
  }
  return tracks;
}

export async function searchTracks(query: string): Promise<{
  tracks: TrackResult[];
  demo: boolean;
}> {
  try {
    const catalog = await searchSpotifyCatalog(query || "party hits", 12);
    return {
      tracks: catalog.map((t) => ({
        id: t.externalId ?? t.id,
        name: t.title,
        artists: t.artists,
        albumArt: t.albumArt,
        previewUrl: t.previewUrl ?? null,
        durationMs: t.durationMs,
        uri: t.externalId ? `spotify:track:${t.externalId}` : t.id,
      })),
      demo: false,
    };
  } catch (err) {
    console.error("Spotify search error", err);
    return { tracks: searchDemoTracks(query), demo: true };
  }
}

export function getSpotifyAuthUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope:
      "playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative user-read-email",
    state,
    // Do not force the consent screen every time — that feels like a loop
    // when export fails and the host retries "Update Spotify playlist".
  });
  return `${SPOTIFY_ACCOUNTS}/authorize?${params}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (!spotifyConfigured()) return null;

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    console.error(
      "Spotify code exchange error",
      { redirectUri, status: res.status },
      await res.text(),
    );
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };

  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

/** True for bare Spotify track ids (not itunes:/manual: prefixed). */
export function isSpotifyTrackId(id: string | null | undefined): id is string {
  if (!id) return false;
  if (id.includes(":")) return false;
  return /^[0-9A-Za-z]{10,30}$/.test(id);
}

/** Extract a Spotify playlist ID from a URL, URI, or raw ID. */
export function parsePlaylistId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const uriMatch = value.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1];

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const playlistIndex = parts.indexOf("playlist");
    if (playlistIndex >= 0 && parts[playlistIndex + 1]) {
      return parts[playlistIndex + 1];
    }
  } catch {
    // not a URL
  }

  if (/^[a-zA-Z0-9]{16,}$/.test(value)) return value;
  return null;
}

export async function fetchPlaylistTracks(playlistUrlOrId: string): Promise<
  | {
      id: string;
      name: string;
      url: string;
      tracks: TrackResult[];
    }
  | { error: string }
> {
  if (!spotifyConfigured()) {
    return {
      error:
        "Spotify API keys are required to import a playlist. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on Render.",
    };
  }

  const playlistId = parsePlaylistId(playlistUrlOrId);
  if (!playlistId) {
    return { error: "That doesn’t look like a Spotify playlist link." };
  }

  const token = await getAppAccessToken();
  if (!token) {
    return { error: "Could not authenticate with Spotify." };
  }

  const metaRes = await fetch(`${SPOTIFY_API}/playlists/${playlistId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!metaRes.ok) {
    const text = await metaRes.text();
    console.error("Spotify playlist meta error", text);
    if (metaRes.status === 404) {
      return {
        error:
          "Playlist not found. Make sure it’s public (or that the link is correct).",
      };
    }
    return { error: "Could not load that Spotify playlist." };
  }

  const meta = (await metaRes.json()) as {
    id: string;
    name: string;
    external_urls?: { spotify?: string };
  };

  const tracks: TrackResult[] = [];
  let nextUrl: string | null =
    `${SPOTIFY_API}/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,name,artists(name),album(images),preview_url,duration_ms,uri))`;

  while (nextUrl) {
    const pageRes: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!pageRes.ok) {
      console.error("Spotify playlist tracks error", await pageRes.text());
      return { error: "Could not load playlist tracks." };
    }

    const page = (await pageRes.json()) as {
      next: string | null;
      items: {
        track: Parameters<typeof mapTrack>[0] | null;
      }[];
    };

    for (const item of page.items) {
      if (item.track?.id) tracks.push(mapTrack(item.track));
    }
    nextUrl = page.next;
  }

  return {
    id: meta.id,
    name: meta.name,
    url:
      meta.external_urls?.spotify ??
      `https://open.spotify.com/playlist/${meta.id}`,
    tracks,
  };
}

async function replacePlaylistTracks(
  accessToken: string,
  playlistId: string,
  trackIds: string[],
) {
  const uris = trackIds.map((id) => `spotify:track:${id}`);
  // First page replaces; further pages append.
  const first = uris.slice(0, 100);
  const replaceRes = await fetch(
    `${SPOTIFY_API}/playlists/${playlistId}/tracks`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: first }),
    },
  );
  if (!replaceRes.ok) {
    console.error("Spotify replace tracks error", await replaceRes.text());
    return false;
  }

  for (let i = 100; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    const addRes = await fetch(
      `${SPOTIFY_API}/playlists/${playlistId}/tracks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: chunk }),
      },
    );
    if (!addRes.ok) {
      console.error("Spotify append tracks error", await addRes.text());
      return false;
    }
  }
  return true;
}

export async function createSpotifyPlaylist(options: {
  accessToken: string;
  name: string;
  description: string;
  trackIds: string[];
  /** When set, rewrite this existing playlist instead of creating a new one. */
  existingPlaylistId?: string | null;
}): Promise<{ id: string; url: string; created: boolean } | null> {
  if (options.existingPlaylistId) {
    const ok = await replacePlaylistTracks(
      options.accessToken,
      options.existingPlaylistId,
      options.trackIds,
    );
    if (ok) {
      return {
        id: options.existingPlaylistId,
        url: `https://open.spotify.com/playlist/${options.existingPlaylistId}`,
        created: false,
      };
    }
    // Linked playlist may be owned by another account or unwritable —
    // fall through and create a new playlist for this Spotify user.
    console.warn(
      "Spotify update of linked playlist failed; creating a new playlist",
      options.existingPlaylistId,
    );
  }

  const meRes = await fetch(`${SPOTIFY_API}/me`, {
    headers: { Authorization: `Bearer ${options.accessToken}` },
    cache: "no-store",
  });

  if (!meRes.ok) {
    console.error("Spotify me error", await meRes.text());
    return null;
  }

  const me = (await meRes.json()) as { id: string };

  const playlistRes = await fetch(`${SPOTIFY_API}/users/${me.id}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: options.name,
      description: options.description,
      public: true,
    }),
  });

  if (!playlistRes.ok) {
    console.error("Spotify create playlist error", await playlistRes.text());
    return null;
  }

  const playlist = (await playlistRes.json()) as {
    id: string;
    external_urls: { spotify: string };
  };

  const ok = await replacePlaylistTracks(
    options.accessToken,
    playlist.id,
    options.trackIds,
  );
  if (!ok && options.trackIds.length > 0) return null;

  return {
    id: playlist.id,
    url: playlist.external_urls.spotify,
    created: true,
  };
}

export function getDemoTrackById(id: string) {
  return DEMO_TRACKS.find((t) => t.id === id) ?? null;
}
