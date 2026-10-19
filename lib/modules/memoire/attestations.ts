import { randomBytes } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { WorkspaceError, log } from "@/lib/workspace/service";
import { nowIso, readData } from "@/lib/workspace/store";
import { computeScore } from "./score";
import { ensureMemoireSeed } from "./seed";
import { getSigningKey, publicKeyIdFromPem, signPayload, verifyPayload } from "./signing";
import { readMemo, withMemo } from "./store";
import type { Attestation, AttestationPayload } from "./types";

/** Attestations signées du Score Co-founder, vérifiables publiquement sur /verifier/<id>. */

const VALIDITY_DAYS = 90;

export async function currentScore(companyId: string) {
  await ensureMemoireSeed(companyId);
  const data = await readData();
  if (!data.companies.some((c) => c.id === companyId)) throw new WorkspaceError("Entreprise introuvable.", 404);
  return computeScore(data, companyId);
}

export async function issueAttestation(companyId: string, actor = "utilisateur"): Promise<Attestation> {
  await ensureMemoireSeed(companyId);
  const key = getSigningKey();
  return withMemo((data, m) => {
    const company = data.companies.find((c) => c.id === companyId);
    if (!company) throw new WorkspaceError("Entreprise introuvable.", 404);
    const result = computeScore(data, companyId);
    const issued = new Date();
    const expires = new Date(issued.getTime() + VALIDITY_DAYS * 86_400_000);
    const id = `att_${randomBytes(9).toString("base64url")}`;
    const payload: AttestationPayload = {
      type: "cofounder-score",
      v: 1,
      id,
      company: { id: company.id, name: company.name, sector: company.sector, isExample: Boolean(company.isExample) },
      score: result.score,
      level: result.level,
      components: result.components.map((c) => ({ key: c.key, label: c.label, weight: c.weight, score: c.score, evidence: c.evidence })),
      methodologyVersion: result.methodologyVersion,
      computedAt: result.computedAt,
      issuedAt: issued.toISOString(),
      expiresAt: expires.toISOString(),
      keyId: key.keyId,
      demo: Boolean(company.isExample) || key.source === "dev",
    };
    const att: Attestation = { id, companyId, payload, signature: signPayload(payload, key), publicKeyPem: key.publicKeyPem, keySource: key.source, issuedBy: actor, createdAt: nowIso() };
    m.attestations.unshift(att);
    log(data, companyId, actor, "score.attestation", `Attestation Score Co-founder ${payload.score}/100 émise (${id}, clé ${key.keyId}${key.source === "dev" ? ", clé de développement" : ""}).`);
    return att;
  });
}

export async function revokeAttestation(id: string, actor = "utilisateur") {
  return withMemo((data, m) => {
    const att = m.attestations.find((a) => a.id === id);
    if (!att) throw new WorkspaceError("Attestation introuvable.", 404);
    att.revokedAt ??= nowIso();
    log(data, att.companyId, actor, "score.revocation", `Attestation ${id} révoquée.`);
    return att;
  });
}

export type Verification = { signatureValid: boolean; keyKnown: boolean; expired: boolean; revoked: boolean; valid: boolean; reasons: string[] };

/** Vérifie un couple (contenu, signature) : signature Ed25519, clé publiée, expiration et révocation. */
export function verifyAttestationParts(payload: AttestationPayload, signature: string, publicKeyPem: string, revokedAt?: string, now = new Date()): Verification {
  const current = getSigningKey();
  const signatureValid = verifyPayload(payload, signature, publicKeyPem);
  const pemId = publicKeyIdFromPem(publicKeyPem);
  // Rotation : les anciennes clés restent reconnues si leur identifiant figure dans COFOUNDER_SCORE_TRUSTED_KEY_IDS.
  const trusted = new Set([current.keyId, ...(process.env.COFOUNDER_SCORE_TRUSTED_KEY_IDS ?? "").split(/[\s,]+/).filter(Boolean)]);
  const keyKnown = pemId === payload.keyId && pemId !== null && trusted.has(pemId);
  const expired = Date.parse(payload.expiresAt) < now.getTime();
  const revoked = Boolean(revokedAt);
  const reasons: string[] = [];
  if (!signatureValid) reasons.push("Signature invalide : le contenu a été modifié ou ne provient pas de Co-founder.");
  if (!keyKnown) reasons.push("La clé de signature ne correspond pas à la clé publique actuellement publiée par Co-founder.");
  if (expired) reasons.push(`Attestation expirée le ${payload.expiresAt.slice(0, 10)}.`);
  if (revoked) reasons.push(`Attestation révoquée le ${revokedAt!.slice(0, 10)}.`);
  return { signatureValid, keyKnown, expired, revoked, valid: signatureValid && keyKnown && !expired && !revoked, reasons };
}

/* ---------------------------------------------------------------- attestation autonome (lien / QR) */

type TokenBody = { p: AttestationPayload; s: string; k?: string };
const MAX_TOKEN_CHARS = 12_000;

/**
 * Jeton autonome : l'attestation signée (contenu + signature) compressée puis encodée en base64url.
 * Le lien /verifier/<id>?a=<jeton> se vérifie sur n'importe quelle instance (serverless : un /tmp par instance)
 * avec la clé publique du serveur — le contenu ne peut pas être modifié sans invalider la signature.
 */
export function encodeAttestationToken(att: Pick<Attestation, "payload" | "signature" | "publicKeyPem">): string {
  const current = getSigningKey();
  const body: TokenBody = { p: att.payload, s: att.signature };
  // Clé incluse seulement si ce n'est pas la clé actuelle (rotation) : elle devra figurer dans COFOUNDER_SCORE_TRUSTED_KEY_IDS.
  if (att.payload.keyId !== current.keyId) body.k = att.publicKeyPem;
  return deflateRawSync(Buffer.from(JSON.stringify(body), "utf8"), { level: 9 }).toString("base64url");
}

export function decodeAttestationToken(token: string): TokenBody | null {
  if (!token || token.length > MAX_TOKEN_CHARS || !/^[\w-]+$/.test(token)) return null;
  try {
    const body = JSON.parse(inflateRawSync(Buffer.from(token, "base64url"), { maxOutputLength: 200_000 }).toString("utf8")) as TokenBody;
    if (!body?.p || typeof body.s !== "string" || body.p.type !== "cofounder-score") return null;
    return body;
  } catch {
    return null;
  }
}

/** Chemin public de vérification (relatif) portant l'attestation signée. */
export function verificationPath(att: Pick<Attestation, "id" | "payload" | "signature" | "publicKeyPem">): string {
  return `/verifier/${att.id}?a=${encodeAttestationToken(att)}`;
}

export type PublicAttestation = {
  id: string;
  payload: AttestationPayload;
  signature: string;
  publicKeyPem: string;
  keySource: Attestation["keySource"] | "inconnue";
  revokedAt?: string;
  /** false : attestation lue depuis le lien, absente du store de cette instance → révocation non vérifiable. */
  revocationChecked: boolean;
  origin: "store" | "lien";
  verification: Verification;
};

export async function getPublicAttestation(id: string, token?: string | null): Promise<PublicAttestation | null> {
  if (!/^att_[\w-]{6,40}$/.test(id)) return null;
  const data = await readData();
  const att = readMemo(data).attestations.find((a) => a.id === id);
  if (att) {
    return {
      id: att.id, payload: att.payload, signature: att.signature, publicKeyPem: att.publicKeyPem, keySource: att.keySource,
      revokedAt: att.revokedAt, revocationChecked: true, origin: "store",
      verification: verifyAttestationParts(att.payload, att.signature, att.publicKeyPem, att.revokedAt),
    };
  }
  const body = token ? decodeAttestationToken(token) : null;
  if (!body || body.p.id !== id) return null;
  const current = getSigningKey();
  const publicKeyPem = body.k ?? current.publicKeyPem;
  return {
    id, payload: body.p, signature: body.s, publicKeyPem,
    keySource: body.p.keyId === current.keyId ? current.source : "inconnue",
    revocationChecked: false, origin: "lien",
    verification: verifyAttestationParts(body.p, body.s, publicKeyPem),
  };
}

export async function listAttestations(companyId: string) {
  const data = await readData();
  return readMemo(data).attestations.filter((a) => a.companyId === companyId);
}

export function publicKeyInfo() {
  const k = getSigningKey();
  return { algorithm: "Ed25519", keyId: k.keyId, publicKeyPem: k.publicKeyPem, source: k.source, storage: k.storage };
}
