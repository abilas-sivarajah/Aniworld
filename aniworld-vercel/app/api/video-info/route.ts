import { NextRequest, NextResponse } from "next/server";
import { makeClient, readConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const title = params.get("title") ?? "";
  const season = Number(params.get("season") ?? "0");
  const episode = Number(params.get("episode") ?? "0");
  const isMovie = params.get("isMovie") === "true";

  if (!title.trim()) {
    return NextResponse.json(
      { error: "Title parameter is required." },
      { status: 400 },
    );
  }

  const config = readConfig(req);
  const client = makeClient(config);

  try {
    const details = isMovie
      ? await client.getMovieVideoInfo(title, episode)
      : await client.getEpisodeVideoInfo(title, episode, season);
    return NextResponse.json(details);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
