import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginRequest {
  password?: string;
  hash?: string;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export async function POST(req: NextRequest) {
  const config = readConfig(req);
  const targetHash = config.passwordHashSHA256.trim().toLowerCase();

  if (!targetHash) {
    return NextResponse.json({ success: true, isProtected: false });
  }

  const body = (await req.json()) as LoginRequest;
  let inputHash = (body.hash ?? "").trim().toLowerCase();
  if (!inputHash && body.password) {
    inputHash = sha256Hex(body.password).toLowerCase();
  }

  if (inputHash && inputHash === targetHash) {
    return NextResponse.json({ success: true, isProtected: true });
  }

  return NextResponse.json(
    { success: false, error: "Falsches Passwort!" },
    { status: 400 },
  );
}
