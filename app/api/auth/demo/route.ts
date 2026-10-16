import { NextResponse } from "next/server";
import { withSession } from "@/lib/auth/current";
import { body, fail, str } from "@/lib/auth/http";
import { demoLogin, toPublic } from "@/lib/auth/service";
import { SEED_USERS } from "@/lib/workspace/seed";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ accounts: SEED_USERS.map(({ id, name, email }) => ({ id, name, email })) });
}

/** Connexion en un clic à un compte démo seedé. */
export async function POST(request: Request) {
  try {
    const user = await demoLogin(str((await body(request)).userId));
    return withSession(NextResponse.json({ user: toPublic(user) }), user);
  } catch (error) {
    return fail(error);
  }
}
