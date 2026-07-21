import { NextRequest, NextResponse } from "next/server";
import { readConfig } from "@/lib/config";
import { extractStreamUrl } from "@/lib/hoster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExtractStreamRequest {
  videoUrl?: string;
  hoster?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ExtractStreamRequest;
  const videoUrl = body.videoUrl ?? "";
  const hoster = body.hoster ?? "";

  if (!videoUrl.trim()) {
    return NextResponse.json(
      { error: "VideoUrl is required." },
      { status: 400 },
    );
  }

  const config = readConfig(req);

  try {
    const streamUrl = await extractStreamUrl(
      hoster,
      videoUrl,
      config.ignoreCertificateValidation,
    );
    return NextResponse.json({ streamUrl, hoster, videoUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
