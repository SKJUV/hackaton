import { NextResponse } from "next/server";
import { withSession } from "@/lib/auth/current";
import { body, fail, safeNext, str } from "@/lib/auth/http";
import { passwordLogin, toPublic } from "@/lib/auth/service";

export const runtime = "nodejs";

/** Connexion par mot de passe (facultative ; le code email reste toujours disponible). */
export async function POST(request: Request) {
  try {
    const b = await body(request);
    const user = await passwordLogin(str(b.email), str(b.password));
    return withSession(NextResponse.json({ user: toPublic(user), next: safeNext(b.next) }), user);
  } catch (error) {
    return fail(error);
  }
}
