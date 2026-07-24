import { NextResponse } from "next/server";
import { z } from "zod";
import { buildConsensus } from "@/lib/consensus";
import { loadRoom, setPhase } from "@/lib/rooms";
import type { RoomPhase } from "@/lib/models";

type Params = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Params) {
  const { code } = await params;
  const participantToken = request.headers.get("x-participant-token");
  const hostToken = request.headers.get("x-host-token");

  const state = await loadRoom(code, { participantToken, hostToken });
  if (!state) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const consensus = buildConsensus(
    state.songs,
    state.participants.length,
  );

  return NextResponse.json({ ...state, consensus });
}

const phaseSchema = z.object({
  phase: z.enum(["lobby", "nominate", "ready", "vote", "results"]),
});

export async function PATCH(request: Request, { params }: Params) {
  const { code } = await params;
  const hostToken = request.headers.get("x-host-token");
  if (!hostToken) {
    return NextResponse.json({ error: "Host token required" }, { status: 401 });
  }

  try {
    const body = phaseSchema.parse(await request.json());
    const result = await setPhase(code, hostToken, body.phase as RoomPhase);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ phase: result.room.phase });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
