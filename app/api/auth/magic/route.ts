import { NextResponse } from "next/server";
import { withSession } from "@/lib/auth/current";
import { verifyMagicToken } from "@/lib/auth/service";

export const runtime = "nodejs";

/** Lien magique : connecte puis redirige. En cas d'échec, renvoie vers /connexion avec un message. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const { user, purpose } = await verifyMagicToken(url.searchParams.get("token") ?? "");
    const dest = purpose === "reinitialisation" ? "/compte?reinitialisation=1" : "/workspace";
    return withSession(NextResponse.redirect(new URL(dest, url)), user);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Lien invalide";
    return NextResponse.redirect(new URL(`/connexion?erreur=${encodeURIComponent(msg)}`, url));
  }
}
