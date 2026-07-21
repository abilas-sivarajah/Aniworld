// Configuration handling. The original .NET app kept a mutable in-memory
// singleton seeded from appsettings.json. On Vercel's stateless serverless
// runtime that cannot persist, so config lives in a per-browser cookie instead
// (seeded from environment variables). This is functionally equivalent and
// actually gives each visitor their own settings.
import type { NextRequest } from "next/server";
import type { AppConfig } from "./types";
import { SerienStreamClient } from "./serienstream";

export const CONFIG_COOKIE = "ss_config";

/** Default config, seeded from env vars (mirrors the appsettings.json seed). */
export function defaultConfig(): AppConfig {
  return normalizeConfig({
    hostUrl: process.env.DEFAULT_HOST_URL || "https://aniworld.to/",
    site: process.env.DEFAULT_SITE || "anime",
    ignoreCertificateValidation: process.env.IGNORE_CERT === "true",
    passwordHashSHA256: process.env.PASSWORD_HASH_SHA256 || "",
  });
}

/** Normalizes a (partial) config — mirrors SerienStreamService.UpdateConfig. */
export function normalizeConfig(input: Partial<AppConfig>): AppConfig {
  let hostUrl =
    !input.hostUrl || !input.hostUrl.trim()
      ? "https://aniworld.to/"
      : input.hostUrl.trim();
  if (!hostUrl.endsWith("/")) hostUrl += "/";

  const site =
    !input.site || !input.site.trim() ? "anime" : input.site.trim().toLowerCase();

  return {
    hostUrl,
    site,
    ignoreCertificateValidation: Boolean(input.ignoreCertificateValidation),
    passwordHashSHA256: (input.passwordHashSHA256 ?? "").trim(),
  };
}

/** Reads the current config from the request cookie, falling back to defaults. */
export function readConfig(req: NextRequest): AppConfig {
  const raw = req.cookies.get(CONFIG_COOKIE)?.value;
  if (!raw) return defaultConfig();
  try {
    return normalizeConfig(JSON.parse(raw) as Partial<AppConfig>);
  } catch {
    return defaultConfig();
  }
}

export function serializeConfig(config: AppConfig): string {
  return JSON.stringify(config);
}

/** Adds the "/stream" suffix expected by the site path (mirrors InitializeClients). */
export function normalizeSite(site: string): string {
  const s = site.trim().toLowerCase();
  return s.includes("stream") ? s : `${s}/stream`;
}

/** Builds a scraping client for a given config. */
export function makeClient(config: AppConfig): SerienStreamClient {
  return new SerienStreamClient(
    config.hostUrl,
    normalizeSite(config.site),
    config.ignoreCertificateValidation,
  );
}
