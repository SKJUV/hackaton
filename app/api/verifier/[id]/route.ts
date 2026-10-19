import { NextResponse } from "next/server";
import { getPublicAttestation } from "@/lib/modules/memoire/attestations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUBLIC (sans connexion) : attestation signée + résultat de vérification. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const att = await getPublicAttestation(id, new URL(request.url).searchParams.get("a") ?? undefined);
  if (!att) return NextResponse.json({ error: "Attestation introuvable." }, { status: 404 });
  return NextResponse.json(att, { headers: { "Cache-Control": "no-store" } });
}
