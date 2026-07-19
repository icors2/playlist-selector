import { NextResponse } from "next/server";
import { searchTracks } from "@/lib/spotify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const result = await searchTracks(q);
  return NextResponse.json(result);
}
