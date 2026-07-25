import { NextResponse } from "next/server";
import { z } from "zod";
import { importPlaylistTracks } from "@/lib/rooms";
import {
  fetchPlaylistTracks,
  parsePlaylistId,
  spotifyConfigured,
} from "@/lib/spotify";

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
    const fetched = await fetchPlaylistTracks(body.playlistUrl);

    // Client Credentials can't read private/blank playlists — still link by URL
    // so OAuth export can write winners into a playlist the host owns.
    const playlist =
      "error" in fetched
        ? (() => {
            const id = parsePlaylistId(body.playlistUrl);
            if (!id) return null;
            return {
              id,
              url: `https://open.spotify.com/playlist/${id}`,
              name: "Linked Spotify playlist",
              tracks: [] as {
                id: string;
                name: string;
                artists: string;
                albumArt: string | null;
                previewUrl: string | null;
                durationMs: number;
              }[],
              linkedByUrlOnly: true as const,
            };
          })()
        : { ...fetched, linkedByUrlOnly: false as const };

    if (!playlist) {
      return NextResponse.json(
        {
          error:
            "error" in fetched
              ? fetched.error
              : "That doesn’t look like a Spotify playlist link.",
        },
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

    return NextResponse.json({
      ...result,
      linkedByUrlOnly: playlist.linkedByUrlOnly,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
