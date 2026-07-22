import { NextResponse } from "next/server";
import { dbConfigured } from "../../../../db";

export async function GET() {
  return NextResponse.json({
    ok: true,
    database: dbConfigured(),
    service: "okaylist",
  });
}
