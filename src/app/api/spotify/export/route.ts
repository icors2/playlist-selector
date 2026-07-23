import { NextResponse } from "next/server";
import { z } from "zod";
import { buildConsensus } from "@/lib/consensus";
import { loadRoom, savePlaylistLink } from "@/lib/rooms";
import {
  createSpotifyPlaylist,
  exchangeCodeForTokens,
  getSpotifyAuthUrl,
  isSpotifyTrackId,
  spotifyConfigured,
} from "@/lib/spotify";

function redirectUri(request: Request) {
  const url = new URL(request.url);
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? `${url.protocol}//${url.host}`;
  return `${base.replace(/\/$/, "")}/api/spotify/export`;
}

const startSchema = z.object({
  code: z.string().min(4).max(8),
});

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

    const statePayload = Buffer.from(
      JSON.stringify({ code: body.code.toUpperCase(), hostToken }),
    ).toString("base64url");

    const url = getSpotifyAuthUrl(statePayload, redirectUri(request));
    return NextResponse.json({ url });
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

  const appBase =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${new URL(request.url).protocol}//${new URL(request.url).host}`;

  if (error || !code || !state) {
    return NextResponse.redirect(`${appBase}/?spotify=denied`);
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { code: string; hostToken: string };

    const tokens = await exchangeCodeForTokens(code, redirectUri(request));
    if (!tokens) {
      return NextResponse.redirect(
        `${appBase}/room/${parsed.code}?spotify=error`,
      );
    }

    const roomState = await loadRoom(parsed.code, {
      hostToken: parsed.hostToken,
    });
    if (!roomState || !roomState.isHost) {
      return NextResponse.redirect(
        `${appBase}/room/${parsed.code}?spotify=error`,
      );
    }

    const consensus = buildConsensus(
      roomState.songs,
      roomState.participants.length,
    );

    const trackIds = consensus.playlist
      .map((s) => s.spotifyTrackId)
      .filter(isSpotifyTrackId);

    if (trackIds.length === 0) {
      return NextResponse.redirect(
        `${appBase}/room/${parsed.code}?spotify=no_spotify_tracks`,
      );
    }

    const playlist = await createSpotifyPlaylist({
      accessToken: tokens.accessToken,
      name: roomState.room.name,
      description: `Built with Okaylist — songs the group approved. Room ${roomState.room.code}.`,
      trackIds,
      // Rewrite the group's existing playlist when one was linked/imported.
      existingPlaylistId: roomState.room.spotifyPlaylistId,
    });

    if (!playlist) {
      return NextResponse.redirect(
        `${appBase}/room/${parsed.code}?spotify=error`,
      );
    }

    await savePlaylistLink(parsed.code, parsed.hostToken, playlist);
    return NextResponse.redirect(
      `${appBase}/room/${parsed.code}?spotify=success`,
    );
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(`${appBase}/?spotify=error`);
  }
}
