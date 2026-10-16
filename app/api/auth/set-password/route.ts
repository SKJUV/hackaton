import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current";
import { body, fail, str } from "@/lib/auth/http";
import { AuthError, setPassword, toPublic } from "@/lib/auth/service";

export const runtime = "nodejs";

/** Définit, change ou supprime (password vide) le mot de passe facultatif. */
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) throw new AuthError("Connectez-vous d'abord.", 401);
    const password = str((await body(request)).password);
    return NextResponse.json({ user: toPublic(await setPassword(user.id, password || null)) });
  } catch (error) {
    return fail(error);
  }
}
