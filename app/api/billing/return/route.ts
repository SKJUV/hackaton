import { NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/billing/service";

export const runtime = "nodejs";

/** Retour du prestataire : vérifie le paiement côté serveur puis redirige. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") ?? "";
  try {
    const sub = await confirmSubscription(ref, { session_id: url.searchParams.get("session_id") ?? "" });
    return NextResponse.redirect(new URL(sub.status === "active" ? "/workspace?abonnement=active" : "/tarifs?paiement=en_attente", url));
  } catch {
    return NextResponse.redirect(new URL("/tarifs?paiement=erreur", url));
  }
}
