import { NextResponse } from "next/server";
import { spotifyAppAuthStatus } from "@/lib/spotify";

export async function GET() {
  const status = await spotifyAppAuthStatus();
  return NextResponse.json(status);
}
