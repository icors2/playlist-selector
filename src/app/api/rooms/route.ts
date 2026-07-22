import { NextResponse } from "next/server";
import { z } from "zod";
import { createRoom, joinRoom } from "@/lib/rooms";

const createSchema = z.object({
  action: z.literal("create"),
  roomName: z.string().min(1).max(80),
  hostName: z.string().min(1).max(40),
});

const joinSchema = z.object({
  action: z.literal("join"),
  code: z.string().min(4).max(8),
  name: z.string().min(1).max(40),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body?.action;

    if (action === "create") {
      const parsed = createSchema.parse(body);
      const result = await createRoom(parsed.roomName, parsed.hostName);
      return NextResponse.json({
        code: result.room.code,
        roomName: result.room.name,
        participantToken: result.participantToken,
        hostToken: result.hostToken,
        participant: {
          id: result.host.id,
          name: result.host.name,
        },
      });
    }

    if (action === "join") {
      const parsed = joinSchema.parse(body);
      const result = await joinRoom(parsed.code, parsed.name);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        code: result.room.code,
        roomName: result.room.name,
        participantToken: result.token,
        participant: {
          id: result.participant.id,
          name: result.participant.name,
        },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 },
      );
    }
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
