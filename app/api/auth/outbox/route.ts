import { NextResponse } from "next/server";
import { listSystemEmails } from "@/lib/auth/service";
import { getMailConfig } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Boîte de démo des emails système (codes, liens) — disponible UNIQUEMENT en MAIL_MODE=simulation. */
export async function GET() {
  if (getMailConfig().mode !== "simulation") return NextResponse.json({ error: "Indisponible hors mode simulation." }, { status: 404 });
  return NextResponse.json({ emails: (await listSystemEmails()).slice(0, 50) });
}
