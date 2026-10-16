import { NextResponse } from "next/server";
import { withSession } from "@/lib/auth/current";
import { body, fail, safeNext, str } from "@/lib/auth/http";
import { toPublic, verifyCode } from "@/lib/auth/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const b = await body(request);
    const { user, purpose } = await verifyCode(str(b.email), str(b.code));
    const next = purpose === "reinitialisation" ? "/compte?reinitialisation=1" : safeNext(b.next);
    return withSession(NextResponse.json({ user: toPublic(user), next }), user);
  } catch (error) {
    return fail(error);
  }
}
