import { NextResponse } from "next/server";
import { searchCatalog } from "@/lib/catalog";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(
    40,
    Math.max(1, Number(searchParams.get("limit") ?? 25) || 25),
  );
  const result = await searchCatalog(q, limit);
  return NextResponse.json(result);
}
