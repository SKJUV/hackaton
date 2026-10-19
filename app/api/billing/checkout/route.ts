import { NextResponse } from "next/server";
import { baseUrlFrom, currentUser } from "@/lib/auth/current";
import { body, fail, str } from "@/lib/auth/http";
import { BillingError, checkout } from "@/lib/billing/service";

export const runtime = "nodejs";

/** Démarre un abonnement : activation simulée immédiate ou redirection vers le prestataire. */
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) throw new BillingError("Connectez-vous (sans mot de passe) ou continuez en démo pour activer l'abonnement.", 401);
    const b = await body(request);
    return NextResponse.json(await checkout(user, str(b.planId), baseUrlFrom(request), b.simulation === true));
  } catch (error) {
    return fail(error);
  }
}
