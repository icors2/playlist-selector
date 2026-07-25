import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildConsensus } from "@/lib/consensus";
import { loadRoom, savePlaylistLink } from "@/lib/rooms";
import {
  createSpotifyPlaylist,
  exchangeCodeForTokens,
  getSpotifyAuthUrl,
  publicAppBase,
  resolveExportTrackIds,
  spotifyConfigured,
  spotifyRedirectUri,
  SPOTIFY_REDIRECT_COOKIE,
  SPOTIFY_STATE_COOKIE,
} from "@/lib/spotify";

const startSchema = z.object({
  code: z.string().min(4).max(8),
});

function clearRedirectCookie(response: NextResponse) {
  response.cookies.set(SPOTIFY_REDIRECT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
}

function roomRedirect(
  appBase: string,
  roomCode: string,
  status: string,
) {
  return NextResponse.redirect(
    `${appBase}/room/${roomCode}?spotify=${status}`,
  );
}

export async function POST(request: Request) {
  if (!spotifyConfigured()) {
    return NextResponse.json(
      {
        error:
          "Spotify credentials are not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to export playlists.",
      },
      { status: 400 },
    );
  }

  try {
    const body = startSchema.parse(await request.json());
    const hostToken = request.headers.get("x-host-token");
    if (!hostToken) {
      return NextResponse.json({ error: "Host token required" }, { status: 401 });
    }

    const state = await loadRoom(body.code, { hostToken });
    if (!state) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    if (!state.isHost) {
      return NextResponse.json({ error: "Only the host can export" }, { status: 403 });
    }
    if (state.room.phase !== "results") {
      return NextResponse.json(
        { error: "Finish voting before exporting" },
        { status: 400 },
      );
    }

    const consensus = buildConsensus(
      state.songs,
      state.participants.length,
    );
    if (consensus.playlist.length === 0) {
      return NextResponse.json(
        { error: "No winning songs to export yet." },
        { status: 400 },
      );
    }

    if (!state.room.spotifyPlaylistId) {
      return NextResponse.json(
        {
          error:
            "Link your Spotify playlist first (on the results page or in the lobby), then submit again.",
        },
        { status: 400 },
      );
    }

    // Resolve iTunes/manual winners to Spotify ids up front so we fail
    // before sending the host through OAuth when search is broken.
    const { trackIds } = await resolveExportTrackIds(consensus.playlist);
    if (trackIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "Couldn’t match winners to Spotify tracks. Spotify search may be down — check /api/spotify/status (tokenOk/searchOk), then try again.",
        },
        { status: 400 },
      );
    }

    const statePayload = Buffer.from(
      JSON.stringify({ code: body.code.toUpperCase(), hostToken }),
    ).toString("base64url");

    // Persist the exact redirect_uri used in authorize so the callback
    // token exchange matches (Spotify requires byte-for-byte equality).
    const redirect = spotifyRedirectUri(request);
    console.info("Spotify OAuth start", { redirectUri: redirect });

    // Client navigates same-origin to /authorize, which 302s to Spotify.
    // Also return direct `url` as a fallback for older clients.
    const authorizeUrl = getSpotifyAuthUrl(statePayload, redirect);
    const response = NextResponse.json({
      next: "/api/spotify/export/authorize",
      url: authorizeUrl,
    });
    const secure = redirect.startsWith("https");
    response.cookies.set(SPOTIFY_REDIRECT_COOKIE, redirect, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 600,
    });
    response.cookies.set(SPOTIFY_STATE_COOKIE, statePayload, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const appBase = publicAppBase(request);

  const cookieStore = await cookies();
  const redirectFromCookie = cookieStore.get(SPOTIFY_REDIRECT_COOKIE)?.value;
  const redirect = redirectFromCookie || spotifyRedirectUri(request);

  if (error || !code || !state) {
    const response = NextResponse.redirect(`${appBase}/?spotify=denied`);
    clearRedirectCookie(response);
    return response;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { code: string; hostToken: string };

    console.info("Spotify OAuth callback", { redirectUri: redirect });

    const tokens = await exchangeCodeForTokens(code, redirect);
    if (!tokens) {
      const response = roomRedirect(appBase, parsed.code, "token");
      clearRedirectCookie(response);
      return response;
    }

    const roomState = await loadRoom(parsed.code, {
      hostToken: parsed.hostToken,
    });
    if (!roomState || !roomState.isHost) {
      const response = roomRedirect(appBase, parsed.code, "room");
      clearRedirectCookie(response);
      return response;
    }

    if (!roomState.room.spotifyPlaylistId) {
      const response = roomRedirect(appBase, parsed.code, "no_link");
      clearRedirectCookie(response);
      return response;
    }

    const consensus = buildConsensus(
      roomState.songs,
      roomState.participants.length,
    );

    const { trackIds } = await resolveExportTrackIds(consensus.playlist);

    if (trackIds.length === 0) {
      const response = roomRedirect(appBase, parsed.code, "no_spotify_tracks");
      clearRedirectCookie(response);
      return response;
    }

    console.info("Spotify writing tracks", {
      playlistId: roomState.room.spotifyPlaylistId,
      trackCount: trackIds.length,
      trackIds: trackIds.slice(0, 5),
    });

    const playlist = await createSpotifyPlaylist({
      accessToken: tokens.accessToken,
      name: roomState.room.name,
      description: `Built with Okaylist — songs the group approved. Room ${roomState.room.code}.`,
      trackIds,
      // Always rewrite the linked playlist (never create a silent alternate).
      existingPlaylistId: roomState.room.spotifyPlaylistId,
    });

    if (!playlist || playlist.error) {
      console.error("Spotify playlist write failed", playlist?.error);
      const response = roomRedirect(appBase, parsed.code, "playlist");
      clearRedirectCookie(response);
      return response;
    }

    if (playlist.trackCount < 1) {
      const response = roomRedirect(appBase, parsed.code, "empty_write");
      clearRedirectCookie(response);
      return response;
    }

    await savePlaylistLink(parsed.code, parsed.hostToken, playlist);
    const status = `success_${playlist.trackCount}`;
    const response = roomRedirect(appBase, parsed.code, status);
    clearRedirectCookie(response);
    return response;
  } catch (err) {
    console.error(err);
    const response = NextResponse.redirect(`${appBase}/?spotify=error`);
    clearRedirectCookie(response);
    return response;
  }
}
