import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasAssistantAccess, paywallEnabled } from "@/lib/billing/service";
import type { User } from "@/lib/workspace/types";
import { getUser } from "./service";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, verifySessionToken } from "./session";

export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  return payload ? getUser(payload.uid) : null;
}

export function withSession<T extends NextResponse>(response: T, user: User): T {
  response.cookies.set(SESSION_COOKIE, createSessionToken(user.id), sessionCookieOptions());
  return response;
}

export function clearSession<T extends NextResponse>(response: T): T {
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}

/** Garde de l'assistant payant : renvoie une réponse 401/402 propre, ou null si l'accès est accordé. */
export async function assistantGuard(): Promise<{ user: User | null; denied: NextResponse | null }> {
  if (!paywallEnabled()) return { user: await currentUser(), denied: null };
  const user = await currentUser();
  if (!user) {
    return { user, denied: NextResponse.json({ error: "Connectez-vous (sans mot de passe) pour utiliser l'assistant.", code: "AUTH_REQUIRED", cta: "/connexion?next=/workspace" }, { status: 401 }) };
  }
  if (!(await hasAssistantAccess(user))) {
    return { user, denied: NextResponse.json({ error: "L'assistant co-fondateur fait partie de l'offre payante.", code: "PAYMENT_REQUIRED", cta: "/tarifs" }, { status: 402 }) };
  }
  return { user, denied: null };
}

export function baseUrlFrom(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}
