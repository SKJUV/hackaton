import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SecretBag } from "./types";

/**
 * Chiffrement au repos des secrets de connecteurs : AES-256-GCM, clé via CONNECTORS_ENCRYPTION_KEY
 * (32 octets en base64/hex, ou phrase secrète dérivée par SHA-256).
 * Sans clé : refus en production ; clé de développement dérivée (signalée « dev ») sinon.
 */
const PREFIX = "v1";

export type KeyStatus = { status: "ok" | "dev" | "absente"; message: string };

export function keyStatus(): KeyStatus {
  if (process.env.CONNECTORS_ENCRYPTION_KEY) return { status: "ok", message: "Secrets chiffrés (AES-256-GCM) avec CONNECTORS_ENCRYPTION_KEY." };
  if (process.env.NODE_ENV === "production") return { status: "absente", message: "CONNECTORS_ENCRYPTION_KEY manquante : impossible d'enregistrer des secrets en production." };
  return { status: "dev", message: "Clé de développement (CONNECTORS_ENCRYPTION_KEY absente) : à définir avant toute mise en production." };
}

function key(): Buffer {
  const raw = process.env.CONNECTORS_ENCRYPTION_KEY;
  if (raw) {
    if (/^[A-Za-z0-9+/=_-]{43,44}$/.test(raw)) {
      const b = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (b.length === 32) return b;
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    return createHash("sha256").update(raw).digest();
  }
  if (process.env.NODE_ENV === "production") throw new Error("CONNECTORS_ENCRYPTION_KEY manquante : secrets non enregistrés.");
  return createHash("sha256").update(`co-founder-dev-key:${process.env.AUTH_SECRET ?? "local"}`).digest();
}

export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptString(payload: string): string {
  const [v, iv, tag, ct] = payload.split(":");
  if (v !== PREFIX || !iv || !tag || !ct) throw new Error("Secret illisible.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

export function sealBag(bag: SecretBag): string | undefined {
  const clean = Object.fromEntries(Object.entries(bag).filter(([, v]) => v !== undefined));
  return Object.keys(clean).length ? encryptString(JSON.stringify(clean)) : undefined;
}

export function openBag(secret?: string): SecretBag {
  if (!secret) return {};
  try {
    return JSON.parse(decryptString(secret)) as SecretBag;
  } catch {
    return {};
  }
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
