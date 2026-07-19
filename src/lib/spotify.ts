import { DEMO_TRACKS, searchDemoTracks, type TrackResult } from "./demo-tracks";

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

export async function searchTracks(query: string): Promise<{
  tracks: TrackResult[];
  demo: boolean;
}> {
  const token = await getAppAccessToken();
  if (!token) {
    return { tracks: searchDemoTracks(query), demo: true };
  }

  const params = new URLSearchParams({
    q: query || "party hits",
    type: "track",
    limit: "12",
  });

  const res = await fetch(`${SPOTIFY_API}/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("Spotify search error", await res.text());
    return { tracks: searchDemoTracks(query), demo: true };
  }

  const data = (await res.json()) as {
    tracks?: { items: Parameters<typeof mapTrack>[0][] };
  };

  return {
    tracks: (data.tracks?.items ?? []).map(mapTrack),
    demo: false,
  };
}

export function getSpotifyAuthUrl(state: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "playlist-modify-public playlist-modify-private user-read-email",
    state,
    show_dialog: "true",
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
    console.error("Spotify code exchange error", await res.text());
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };

  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function createSpotifyPlaylist(options: {
  accessToken: string;
  name: string;
  description: string;
  trackIds: string[];
}): Promise<{ id: string; url: string } | null> {
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

  if (options.trackIds.length > 0) {
    const uris = options.trackIds.map((id) => `spotify:track:${id}`);
    for (let i = 0; i < uris.length; i += 100) {
      const chunk = uris.slice(i, i + 100);
      const addRes = await fetch(
        `${SPOTIFY_API}/playlists/${playlist.id}/tracks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: chunk }),
        },
      );
      if (!addRes.ok) {
        console.error("Spotify add tracks error", await addRes.text());
      }
    }
  }

  return { id: playlist.id, url: playlist.external_urls.spotify };
}

export function getDemoTrackById(id: string) {
  return DEMO_TRACKS.find((t) => t.id === id) ?? null;
}
