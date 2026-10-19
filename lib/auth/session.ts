import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Session simple : cookie signé HMAC-SHA256 (payload base64url + signature).
 * AUTH_SECRET doit être défini en production ; un secret de développement est utilisé sinon.
 */
export const SESSION_COOKIE = "dcm_session";
const DEV_SECRET = "dev-only-secret-change-me-droit-cm";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function authSecret(): string {
  return process.env.AUTH_SECRET || DEV_SECRET;
}

export function usingDevSecret(): boolean {
  return !process.env.AUTH_SECRET;
}

type Payload = { uid: string; iat: number; exp: number };

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function createSessionToken(uid: string, ttl = SESSION_TTL_SECONDS, now = Date.now()): string {
  const payload: Payload = { uid, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttl };
  const data = b64(JSON.stringify(payload));
  return `${data}.${sign(data, authSecret())}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): Payload | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data, authSecret()));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Payload;
    if (typeof payload.uid !== "string" || payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.AUTH_INSECURE_COOKIE !== "true",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
