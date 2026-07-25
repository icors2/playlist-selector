import { NextResponse } from "next/server";
import { z } from "zod";
import { setParticipantReady } from "@/lib/rooms";

type Params = { params: Promise<{ code: string }> };

const bodySchema = z.object({
  ready: z.boolean(),
});

export async function POST(request: Request, { params }: Params) {
  const { code } = await params;
  const participantToken = request.headers.get("x-participant-token");
  if (!participantToken) {
    return NextResponse.json({ error: "Join the room first" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const result = await setParticipantReady({
      code,
      participantToken,
      ready: body.ready,
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
