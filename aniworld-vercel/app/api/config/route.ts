import { NextRequest, NextResponse } from "next/server";
import {
  CONFIG_COOKIE,
  normalizeConfig,
  readConfig,
  serializeConfig,
} from "@/lib/config";
import type { AppConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function GET(req: NextRequest) {
  return NextResponse.json(readConfig(req));
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<AppConfig>;
  const config = normalizeConfig(body);

  const res = NextResponse.json(config);
  res.cookies.set(CONFIG_COOKIE, serializeConfig(config), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return res;
}
