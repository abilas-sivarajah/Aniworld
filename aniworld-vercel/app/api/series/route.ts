import { NextRequest, NextResponse } from "next/server";
import {
  CONFIG_COOKIE,
  makeClient,
  normalizeConfig,
  readConfig,
  serializeConfig,
} from "@/lib/config";
import { SerienStreamClient, SeriesNotFoundError } from "@/lib/serienstream";
import { HttpRequestError } from "@/lib/http";
import type { AppConfig, Series } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_YEAR = 60 * 60 * 24 * 365;

function withUpdatedConfig(series: Series, config: AppConfig): NextResponse {
  const res = NextResponse.json(series);
  res.cookies.set(CONFIG_COOKIE, serializeConfig(config), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return res;
}

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
    const series = await makeClient(config).getSeries(title);
    return NextResponse.json(series);
  } catch (err) {
    if (err instanceof SeriesNotFoundError) {
      return NextResponse.json(
        {
          error: `'${title}' wurde auf ${config.hostUrl} nicht gefunden. Bitte überprüfe den genauen Namen.`,
        },
        { status: 404 },
      );
    }

    if (err instanceof HttpRequestError) {
      return NextResponse.json(
        {
          error: `Verbindungsfehler zur Ziel-URL (${config.hostUrl}): ${err.message}. Bitte aktiviere 'SSL Zertifikatsprüfung ignorieren' oder passe die Host-URL in den Einstellungen an.`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
