import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Clé de signature Ed25519 des attestations du Score Co-founder.
 * - Production : COFOUNDER_SCORE_SIGNING_KEY = clé privée PKCS#8 (PEM, « \n » échappés acceptés) ou base64
 *   (DER PKCS#8, ou graine brute de 32 octets).
 * - Développement : générée au premier usage et conservée à côté de la base JSON
 *   (`score-signing-key.dev.pem`, droits 600, ignorée par git). La clé privée n'est jamais renvoyée au client.
 */
export type SigningKey = { privateKey: KeyObject; publicKey: KeyObject; publicKeyPem: string; keyId: string; source: "env" | "dev" };

let cached: { fingerprint: string; key: SigningKey } | null = null;

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function devKeyPath(): string {
  if (process.env.COFOUNDER_SCORE_KEY_FILE) return process.env.COFOUNDER_SCORE_KEY_FILE;
  const db = process.env.WORKSPACE_DB_PATH || path.join(process.cwd(), "data", "workspace.db.json");
  return path.join(path.dirname(db), "score-signing-key.dev.pem");
}

export function parsePrivateKey(raw: string): KeyObject {
  const v = raw.trim();
  if (v.includes("BEGIN")) return createPrivateKey(v.replace(/\\n/g, "\n"));
  const der = Buffer.from(v, "base64");
  if (der.length === 32) return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, der]), format: "der", type: "pkcs8" });
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

function build(privateKey: KeyObject, source: SigningKey["source"]): SigningKey {
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("COFOUNDER_SCORE_SIGNING_KEY doit être une clé Ed25519.");
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ type: "spki", format: "der" });
  return { privateKey, publicKey, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(), keyId: keyIdOf(spki), source };
}

export function keyIdOf(spkiDer: Buffer): string {
  return createHash("sha256").update(spkiDer).digest("hex").slice(0, 16);
}

export function getSigningKey(): SigningKey {
  const env = process.env.COFOUNDER_SCORE_SIGNING_KEY;
  const fingerprint = env ? `env:${createHash("sha256").update(env).digest("hex")}` : `file:${devKeyPath()}`;
  if (cached?.fingerprint === fingerprint) return cached.key;
  let key: SigningKey;
  if (env) key = build(parsePrivateKey(env), "env");
  else {
    const file = devKeyPath();
    if (!existsSync(file)) {
      if (process.env.NODE_ENV === "production") console.warn("[score] COFOUNDER_SCORE_SIGNING_KEY absente : clé Ed25519 générée localement (à remplacer par une clé gérée).");
      const { privateKey } = generateKeyPairSync("ed25519");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
      try {
        chmodSync(file, 0o600);
      } catch {
        /* système de fichiers sans droits POSIX */
      }
    }
    key = build(createPrivateKey(readFileSync(file, "utf8")), "dev");
  }
  cached = { fingerprint, key };
  return key;
}

/** JSON canonique : clés triées récursivement, sans espaces (signature reproductible). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

export function signPayload(payload: unknown, key = getSigningKey()): string {
  return sign(null, Buffer.from(canonicalJson(payload)), key.privateKey).toString("base64url");
}

export function verifyPayload(payload: unknown, signature: string, publicKeyPem: string): boolean {
  try {
    return verify(null, Buffer.from(canonicalJson(payload)), createPublicKey(publicKeyPem), Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

export function publicKeyIdFromPem(pem: string): string | null {
  try {
    return keyIdOf(createPublicKey(pem).export({ type: "spki", format: "der" }));
  } catch {
    return null;
  }
}
