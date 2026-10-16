import { NextResponse } from "next/server";
import { withSession } from "@/lib/auth/current";
import { fail } from "@/lib/auth/http";
import { guestLogin, toPublic } from "@/lib/auth/service";

export const runtime = "nodejs";

/** « Continuer en démo » : session invité sans email ni mot de passe. */
export async function POST() {
  try {
    const user = await guestLogin();
    return withSession(NextResponse.json({ user: toPublic(user) }), user);
  } catch (error) {
    return fail(error);
  }
}
