import { createHmac } from "node:crypto";
import { env } from "./config";
import { safeEqual } from "./crypto";

/** Vérification Meta : renvoie hub.challenge si hub.verify_token == WHATSAPP_VERIFY_TOKEN. */
export function whatsappVerifyChallenge(params: URLSearchParams): string | null {
  const expected = env("WHATSAPP_VERIFY_TOKEN");
  if (!expected) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  return safeEqual(params.get("hub.verify_token") ?? "", expected) ? params.get("hub.challenge") ?? "" : null;
}

/** Signature X-Hub-Signature-256 = sha256=HMAC_SHA256(META_APP_SECRET, corps brut). Refus si le secret manque. */
export function verifyWhatsAppSignature(rawBody: string, header: string | null): boolean {
  const secret = env("META_APP_SECRET") || env("WHATSAPP_APP_SECRET");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  return safeEqual(header, expected);
}
