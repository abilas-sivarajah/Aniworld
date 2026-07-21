import { NextRequest, NextResponse } from "next/server";
import { makeClient, readConfig } from "@/lib/config";
import {
  SeasonNotFoundError,
  SeriesNotFoundError,
} from "@/lib/serienstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") ?? "";
  const season = Number(req.nextUrl.searchParams.get("season") ?? "0");

  if (!title.trim()) {
    return NextResponse.json(
      { error: "Title parameter is required." },
      { status: 400 },
    );
  }

  const config = readConfig(req);

  try {
    const episodes = await makeClient(config).getEpisodes(title, season);
    return NextResponse.json(episodes);
  } catch (err) {
    if (err instanceof SeasonNotFoundError) {
      return NextResponse.json(
        { error: `Season ${season} for '${title}' not found.` },
        { status: 404 },
      );
    }
    if (err instanceof SeriesNotFoundError) {
      return NextResponse.json(
        { error: `Series '${title}' not found.` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
