import { NextResponse } from "next/server";
import { baseUrlFrom } from "@/lib/auth/current";
import { body, fail, str } from "@/lib/auth/http";
import { requestLoginCode } from "@/lib/auth/service";

export const runtime = "nodejs";

/** Envoie un code + lien magique (connexion, inscription ou mot de passe oublié). */
export async function POST(request: Request) {
  try {
    const b = await body(request);
    const purpose = str(b.purpose) === "reinitialisation" ? "reinitialisation" : str(b.purpose) === "inscription" ? "inscription" : "connexion";
    return NextResponse.json(await requestLoginCode(str(b.email), purpose, baseUrlFrom(request), str(b.name) || undefined));
  } catch (error) {
    return fail(error);
  }
}
