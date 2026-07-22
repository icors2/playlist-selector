import { NextResponse } from "next/server";
import { z } from "zod";
import { nominateSong, removeSong } from "@/lib/rooms";

type Params = { params: Promise<{ code: string }> };

const nominateSchema = z.object({
  // Optional — omitted for manual entries (title + artist typed by users)
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  artists: z.string().min(1).max(200),
  albumArt: z.string().nullable().optional(),
  previewUrl: z.string().nullable().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { code } = await params;
  const participantToken = request.headers.get("x-participant-token");
  if (!participantToken) {
    return NextResponse.json({ error: "Join the room first" }, { status: 401 });
  }

  try {
    const track = nominateSchema.parse(await request.json());
    const result = await nominateSong({
      code,
      participantToken,
      track: {
        id: track.id,
        name: track.name,
        artists: track.artists,
        albumArt: track.albumArt ?? null,
        previewUrl: track.previewUrl ?? null,
        durationMs: track.durationMs ?? 0,
      },
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ song: result.song });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid track" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { code } = await params;
  const participantToken = request.headers.get("x-participant-token");
  const hostToken = request.headers.get("x-host-token");
  if (!participantToken) {
    return NextResponse.json({ error: "Join the room first" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const songId = searchParams.get("songId");
  if (!songId) {
    return NextResponse.json({ error: "songId required" }, { status: 400 });
  }

  const result = await removeSong({
    code,
    participantToken,
    hostToken,
    songId,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
