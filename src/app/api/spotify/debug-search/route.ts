import { NextResponse } from "next/server";
import { searchSpotifyCatalog, spotifyConfigured } from "@/lib/spotify";

/** Temporary diagnostics for Render Spotify search failures. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") || "mr brightside";
  if (!spotifyConfigured()) {
    return NextResponse.json({
      ok: false,
      error: "not configured",
      probeVersion: "2026-07-24c",
    });
  }
  try {
    const tracks = await searchSpotifyCatalog(q, 3);
    return NextResponse.json({
      ok: true,
      probeVersion: "2026-07-24c",
      count: tracks.length,
      tracks: tracks.map((t) => ({
        title: t.title,
        artists: t.artists,
        externalId: t.externalId,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        probeVersion: "2026-07-24c",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
