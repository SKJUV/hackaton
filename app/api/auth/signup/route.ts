import { NextResponse } from "next/server";
import { withSession } from "@/lib/auth/current";
import { body, fail, safeNext, str } from "@/lib/auth/http";
import { AuthError, signup, toPublic } from "@/lib/auth/service";

export const runtime = "nodejs";

/** Inscription immédiate, sans attente de vérification ; mot de passe facultatif. */
export async function POST(request: Request) {
  try {
    const b = await body(request);
    const password = str(b.password);
    if (password && password.length < 6) throw new AuthError("Mot de passe : 6 caractères minimum, ou laissez vide.");
    const user = await signup(str(b.email), str(b.name), password || undefined);
    return withSession(NextResponse.json({ user: toPublic(user), next: safeNext(b.next) }), user);
  } catch (error) {
    return fail(error);
  }
}
