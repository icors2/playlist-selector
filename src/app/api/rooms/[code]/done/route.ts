import { NextResponse } from "next/server";
import { setParticipantVotingDone } from "@/lib/rooms";

type Params = { params: Promise<{ code: string }> };

export async function POST(request: Request, { params }: Params) {
  const { code } = await params;
  const participantToken = request.headers.get("x-participant-token");
  if (!participantToken) {
    return NextResponse.json({ error: "Join the room first" }, { status: 401 });
  }

  try {
    const result = await setParticipantVotingDone({
      code,
      participantToken,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
