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
    let results = await makeClient(config).search(keyword);

    // Fallback to the sibling host if the configured one returns nothing.
    if (results.length === 0) {
      const usesAniworld = config.hostUrl.includes("aniworld.to");
      const fallbackHost = usesAniworld ? "https://s.to/" : "https://aniworld.to/";
      const fallbackSite = usesAniworld ? "serie/stream" : "anime/stream";
      const fallbackClient = new SerienStreamClient(
        fallbackHost,
        fallbackSite,
        config.ignoreCertificateValidation,
      );
      results = await fallbackClient.search(keyword);
    }

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
