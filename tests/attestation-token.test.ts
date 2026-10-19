import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { useTempDb } from "./setup-db";
import { decodeAttestationToken, encodeAttestationToken, getPublicAttestation, issueAttestation, revokeAttestation, verificationPath } from "@/lib/modules/memoire/attestations";
import { __clearCache } from "@/lib/workspace/store";

const CO = "co_kmerlog";

describe("attestation autonome (lien / QR portant l'attestation signée)", () => {
  afterAll(() => { delete process.env.COFOUNDER_SCORE_SIGNING_KEY; });
  beforeEach(() => {
    useTempDb();
    process.env.COFOUNDER_SCORE_SIGNING_KEY = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  });

  it("le lien contient l'attestation et se vérifie sur une autre instance (store vide)", async () => {
    const att = await issueAttestation(CO, "test");
    const path = verificationPath(att);
    expect(path).toMatch(new RegExp(`^/verifier/${att.id}\\?a=[\\w-]+$`));
    expect(path.length).toBeLessThan(2500); // tient dans un QR code
    const token = new URL(`https://x.test${path}`).searchParams.get("a")!;
    // Autre instance : nouveau /tmp, store vierge.
    useTempDb();
    __clearCache();
    const pub = await getPublicAttestation(att.id, token);
    expect(pub?.origin).toBe("lien");
    expect(pub?.verification.signatureValid).toBe(true);
    expect(pub?.verification.keyKnown).toBe(true);
    expect(pub?.verification.valid).toBe(true);
    expect(pub?.revocationChecked).toBe(false);
    expect(pub?.payload.score).toBe(att.payload.score);
  });

  it("sans jeton et hors store : introuvable ; jeton d'une autre attestation : refusé", async () => {
    const a1 = await issueAttestation(CO, "test");
    const a2 = await issueAttestation(CO, "test");
    useTempDb();
    __clearCache();
    expect(await getPublicAttestation(a1.id)).toBeNull();
    expect(await getPublicAttestation(a1.id, encodeAttestationToken(a2))).toBeNull();
  });

  it("contenu modifié dans le jeton → signature invalide", async () => {
    const att = await issueAttestation(CO, "test");
    const body = decodeAttestationToken(encodeAttestationToken(att))!;
    const forged = encodeAttestationToken({ payload: { ...body.p, score: 100 }, signature: body.s, publicKeyPem: att.publicKeyPem });
    useTempDb();
    __clearCache();
    const pub = await getPublicAttestation(att.id, forged);
    expect(pub?.verification.signatureValid).toBe(false);
    expect(pub?.verification.valid).toBe(false);
  });

  it("signée par une clé étrangère (jeton forgé avec sa propre clé) → clé inconnue", async () => {
    const att = await issueAttestation(CO, "test");
    process.env.COFOUNDER_SCORE_SIGNING_KEY = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    useTempDb();
    __clearCache();
    const pub = await getPublicAttestation(att.id, encodeAttestationToken(att));
    expect(pub?.verification.keyKnown).toBe(false);
    expect(pub?.verification.valid).toBe(false);
  });

  it("révocation consultée dans le store quand l'attestation y est", async () => {
    const att = await issueAttestation(CO, "test");
    await revokeAttestation(att.id, "test");
    const pub = await getPublicAttestation(att.id, encodeAttestationToken(att));
    expect(pub?.origin).toBe("store");
    expect(pub?.revocationChecked).toBe(true);
    expect(pub?.verification.revoked).toBe(true);
    expect(pub?.verification.valid).toBe(false);
  });

  it("jetons invalides rejetés sans erreur", () => {
    expect(decodeAttestationToken("pas-un-jeton")).toBeNull();
    expect(decodeAttestationToken("a".repeat(20_000))).toBeNull();
    expect(decodeAttestationToken("<script>")).toBeNull();
  });
});
