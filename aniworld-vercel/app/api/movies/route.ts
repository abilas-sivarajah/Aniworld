import { NextRequest, NextResponse } from "next/server";
import { makeClient, readConfig } from "@/lib/config";
import { SeriesNotFoundError } from "@/lib/serienstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title") ?? "";
  if (!title.trim()) {
    return NextResponse.json(
      { error: "Title parameter is required." },
      { status: 400 },
    );
  }

  const config = readConfig(req);

  try {
    const movies = await makeClient(config).getMovies(title);
    return NextResponse.json(movies);
  } catch (err) {
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
