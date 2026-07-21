import { NextRequest, NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import { resolveFinalUrl } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolves an s.to/aniworld "/redirect/xxx" link to the hoster's embed URL so the
// browser can iframe it directly. The video then streams straight from the hoster
// to the user (token bound to the user's IP) — nothing streams through Vercel.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!url.trim()) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }

  const config = readConfig(req);

  try {
    const embedUrl = await resolveFinalUrl(url, {
      ignoreCertificateValidation: config.ignoreCertificateValidation,
    });
    return NextResponse.json({ embedUrl });
  } catch (err) {
    // Fall back to the original url — the browser can still try to iframe it.
    return NextResponse.json({
      embedUrl: url,
      warning: err instanceof Error ? err.message : String(err),
    });
  }
}
