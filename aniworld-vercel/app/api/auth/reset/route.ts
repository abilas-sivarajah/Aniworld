import { NextResponse } from "next/server";
import { CONFIG_COOKIE } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Clears the per-browser config cookie, removing any password protection so a
// locked-out user can always regain access (the "protection" is cookie-deep, not
// real security).
export function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CONFIG_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
