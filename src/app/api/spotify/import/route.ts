import { NextResponse } from "next/server";
import { z } from "zod";
import { importPlaylistTracks } from "@/lib/rooms";
import { fetchPlaylistTracks, spotifyConfigured } from "@/lib/spotify";

const schema = z.object({
  code: z.string().min(4).max(8),
  playlistUrl: z.string().min(8).max(500),
});

export async function POST(request: Request) {
  if (!spotifyConfigured()) {
    return NextResponse.json(
      {
        error:
          "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on Render to import playlists. Free Spotify Developer app — see README.",
        needsSpotify: true,
      },
      { status: 400 },
    );
  }

  const hostToken = request.headers.get("x-host-token");
  const participantToken = request.headers.get("x-participant-token");
  if (!hostToken || !participantToken) {
    return NextResponse.json(
      { error: "Host access required to import" },
      { status: 401 },
    );
  }

  try {
    const body = schema.parse(await request.json());
    const playlist = await fetchPlaylistTracks(body.playlistUrl);
    if ("error" in playlist) {
      return NextResponse.json({ error: playlist.error }, { status: 400 });
    }

    if (playlist.tracks.length === 0) {
      return NextResponse.json(
        { error: "That playlist has no tracks to import." },
        { status: 400 },
      );
    }

    const result = await importPlaylistTracks({
      code: body.code,
      hostToken,
      participantToken,
      playlist: {
        id: playlist.id,
        url: playlist.url,
        name: playlist.name,
        tracks: playlist.tracks,
      },
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
