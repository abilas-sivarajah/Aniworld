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
      const currentHost = config.hostUrl;
      const currentSite = config.site;

      const altHost =
        currentHost.includes("aniworld.to") || currentHost.includes("anicloud.to")
          ? "https://s.to/"
          : "https://aniworld.to/";
      const altSite = currentSite.includes("anime")
        ? "serie/stream"
        : "anime/stream";

      // Try 1: alternate site on current host.
      try {
        const series = await new SerienStreamClient(
          currentHost,
          altSite,
          config.ignoreCertificateValidation,
        ).getSeries(title);
        return withUpdatedConfig(
          series,
          normalizeConfig({
            hostUrl: currentHost,
            site: altSite,
            ignoreCertificateValidation: config.ignoreCertificateValidation,
            passwordHashSHA256: config.passwordHashSHA256,
          }),
        );
      } catch {
        /* try next */
      }

      // Try 2: alternate host + alternate site.
      try {
        const series = await new SerienStreamClient(
          altHost,
          altSite,
          config.ignoreCertificateValidation,
        ).getSeries(title);
        return withUpdatedConfig(
          series,
          normalizeConfig({
            hostUrl: altHost,
            site: altSite,
            ignoreCertificateValidation: config.ignoreCertificateValidation,
            passwordHashSHA256: config.passwordHashSHA256,
          }),
        );
      } catch {
        /* fall through to 404 */
      }

      return NextResponse.json(
        {
          error: `'${title}' wurde weder auf ${currentHost} noch auf ${altHost} gefunden. Bitte überprüfe den genauen Namen.`,
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
