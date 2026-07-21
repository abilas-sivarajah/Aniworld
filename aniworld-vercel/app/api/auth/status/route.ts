import { NextRequest, NextResponse } from "next/server";
import { readConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const config = readConfig(req);
  const isProtected = Boolean(config.passwordHashSHA256.trim());
  return NextResponse.json({ isProtected });
}
