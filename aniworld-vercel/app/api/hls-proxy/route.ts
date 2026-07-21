import { NextRequest, NextResponse } from "next/server";

// Streams a hoster HLS manifest / media segments (or a plain video file) through
// the Vercel backend. This is what makes the extracted "Direkt-Stream" actually
// play in the browser: the hoster CDN (e.g. VOE's cloudwindow-route.com) neither
// sends CORS headers nor accepts the browser's Origin/Referer, and its signed
// token was minted for this backend's request — so the browser cannot load it
// directly. The proxy re-fetches server-side with a proper User-Agent/Referer,
// rewrites playlist URLs back through itself, and adds permissive CORS headers.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Accept-Ranges, Content-Type",
};

function isPlaylist(targetUrl: string, contentType: string | null): boolean {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("mpegurl") || ct.includes("vnd.apple.mpegurl")) return true;
    if (ct.includes("application/octet-stream") && /\.m3u8(\?|$)/i.test(targetUrl))
      return true;
  }
  return /\.m3u8(\?|$)/i.test(targetUrl);
}

/** Build the same-origin proxy URL for a child resource. */
function proxify(absoluteUrl: string, referer: string | null): string {
  const params = new URLSearchParams({ url: absoluteUrl });
  if (referer) params.set("ref", referer);
  return `/api/hls-proxy?${params.toString()}`;
}

/** Rewrite a URI attribute inside a playlist tag line (e.g. EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA). */
function rewriteTagUris(
  line: string,
  base: string,
  referer: string | null,
): string {
  return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => {
    try {
      const abs = new URL(uri, base).toString();
      return `URI="${proxify(abs, referer)}"`;
    } catch {
      return `URI="${uri}"`;
    }
  });
}

/** Rewrite every segment / sub-playlist / key URL in an m3u8 to route back through this proxy. */
function rewriteManifest(
  manifest: string,
  base: string,
  referer: string | null,
): string {
  const lines = manifest.split(/\r?\n/);
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return line;
    if (trimmed.startsWith("#")) {
      // Tag line — rewrite any embedded URI="" (keys, maps, alternate renditions).
      if (trimmed.includes('URI="')) return rewriteTagUris(line, base, referer);
      return line;
    }
    // Bare resource line — a segment or a nested playlist.
    try {
      const abs = new URL(trimmed, base).toString();
      return proxify(abs, referer);
    } catch {
      return line;
    }
  });
  return out.join("\n");
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  const referer = searchParams.get("ref");

  if (!target) {
    return NextResponse.json(
      { error: "url query parameter is required." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return NextResponse.json(
      { error: "url query parameter is not a valid URL." },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (targetUrl.protocol !== "https:" && targetUrl.protocol !== "http:") {
    return NextResponse.json(
      { error: "Only http/https targets are allowed." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Forward Range so seeking and native <video> byte-range playback work.
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Accept: "*/*",
    // A referer of the resource's own origin satisfies most hotlink checks;
    // callers may override via ?ref= with the hoster embed page.
    Referer: referer || `${targetUrl.protocol}//${targetUrl.host}/`,
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders["Range"] = range;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Upstream fetch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const contentType = upstream.headers.get("content-type");

  // Playlist → download, rewrite child URLs, hand back as an HLS manifest.
  if (isPlaylist(upstream.url || targetUrl.toString(), contentType)) {
    const body = await upstream.text();
    const rewritten = rewriteManifest(body, upstream.url || targetUrl.toString(), referer);
    return new NextResponse(rewritten, {
      status: upstream.ok ? 200 : upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "no-store",
      },
    });
  }

  // Media segment / key / plain video file → stream the bytes straight through.
  const respHeaders: Record<string, string> = { ...CORS_HEADERS };
  for (const h of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "cache-control",
  ]) {
    const v = upstream.headers.get(h);
    if (v) respHeaders[h] = v;
  }
  if (!respHeaders["accept-ranges"]) respHeaders["accept-ranges"] = "bytes";

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
