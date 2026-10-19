import { NextResponse } from "next/server";
import { publicKeyInfo } from "@/lib/modules/memoire/attestations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUBLIC : clé publique Ed25519 des attestations (jamais la clé privée). */
export async function GET() {
  return NextResponse.json(publicKeyInfo());
}
