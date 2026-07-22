import { NextResponse } from "next/server";
import { z } from "zod";
import { castVote } from "@/lib/rooms";

type Params = { params: Promise<{ code: string }> };

const voteSchema = z.object({
  songId: z.string().uuid(),
  value: z.enum(["love", "okay", "pass"]),
});

export async function POST(request: Request, { params }: Params) {
  const { code } = await params;
  const participantToken = request.headers.get("x-participant-token");
  if (!participantToken) {
    return NextResponse.json({ error: "Join the room first" }, { status: 401 });
  }

  try {
    const body = voteSchema.parse(await request.json());
    const result = await castVote({
      code,
      participantToken,
      songId: body.songId,
      value: body.value,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ vote: result.vote });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid vote" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
