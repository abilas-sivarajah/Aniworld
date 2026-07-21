import { NextRequest, NextResponse } from "next/server";
import { makeClient, readConfig } from "@/lib/config";
import { SerienStreamClient } from "@/lib/serienstream";
import type { SearchResultItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("keyword") ?? "";
  if (!keyword.trim()) {
    return NextResponse.json([] as SearchResultItem[]);
  }

  const config = readConfig(req);

  try {
    const results = await makeClient(config).search(keyword);

    // Extra filtering performed by the original web app endpoint.
    const cleaned = results.filter((item) => !item.link.includes("/frage/"));
    return NextResponse.json(cleaned);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
