import { NextResponse } from "next/server";
import { searchCatalog } from "@/lib/catalog";
import { spotifyConfigured } from "@/lib/spotify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(
    40,
    Math.max(1, Number(searchParams.get("limit") ?? 20) || 20),
  );
  const result = await searchCatalog(q, limit);
  return NextResponse.json({
    ...result,
    // Helps diagnose Render search fallbacks without reading logs.
    meta: {
      configured: spotifyConfigured(),
      limit,
      probeVersion: "2026-07-24c",
    },
  });
}
