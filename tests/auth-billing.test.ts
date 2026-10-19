import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import {
  checkPassword,
  demoLogin,
  guestLogin,
  hashPassword,
  passwordLogin,
  requestLoginCode,
  setPassword,
  signup,
  verifyCode,
  verifyMagicToken,
} from "@/lib/auth/service";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { getPlans } from "@/lib/billing/plans";
import { verifyHmacSignature, verifyStripeSignature } from "@/lib/billing/providers";
import { cancelSubscription, checkout, confirmSubscription, hasAssistantAccess } from "@/lib/billing/service";
import { readData } from "@/lib/workspace/store";
import { createHmac } from "node:crypto";

describe("sessions", () => {
  it("signe et vérifie, refuse la falsification et l'expiration", () => {
    const token = createSessionToken("usr_1");
    expect(verifySessionToken(token)?.uid).toBe("usr_1");
    const [data] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", iat: 0, exp: 9e9 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${token.split(".")[1]}`)).toBeNull();
    expect(verifySessionToken(`${data}.xxx`)).toBeNull();
    expect(verifySessionToken(createSessionToken("u", 10, Date.now() - 60000))).toBeNull();
  });
});

describe("authentification sans blocage", () => {
  beforeEach(useTempDb);

  it("code email : affiché en mode démo, usage unique, crée le compte", async () => {
    const res = await requestLoginCode("Nouvelle@Exemple.com", "connexion", "http://localhost:3000", "Nouvelle");
    expect(res.demoCode).toMatch(/^\d{6}$/);
    const { user } = await verifyCode("nouvelle@exemple.com", res.demoCode!);
    expect(user.email).toBe("nouvelle@exemple.com");
    await expect(verifyCode("nouvelle@exemple.com", res.demoCode!)).rejects.toThrow(/déjà utilisé/);
    const data = await readData();
    expect(data.systemEmails[0].status).toBe("simule");
    expect(data.systemEmails[0].body).toContain(res.demoCode!);
  });

  it("lien magique et mot de passe oublié", async () => {
    const res = await requestLoginCode("a@exemple.com", "reinitialisation", "http://x");
    const token = new URL(res.demoLink!).searchParams.get("token")!;
    const out = await verifyMagicToken(token);
    expect(out.purpose).toBe("reinitialisation");
  });

  it("inscription immédiate, mot de passe facultatif", async () => {
    const u = await signup("b@exemple.com", "B");
    expect(u.passwordHash).toBeUndefined();
    await expect(passwordLogin("b@exemple.com", "x")).rejects.toThrow(/code par email/);
    await setPassword(u.id, "secret123");
    expect((await passwordLogin("b@exemple.com", "secret123")).id).toBe(u.id);
    await setPassword(u.id, null);
    await expect(passwordLogin("b@exemple.com", "secret123")).rejects.toThrow();
  });

  it("invité et comptes démo en un clic", async () => {
    expect((await guestLogin()).kind).toBe("invite");
    expect((await demoLogin("usr_demo_freddy")).kind).toBe("demo");
  });

  it("hachage scrypt", () => {
    const h = hashPassword("abc123");
    expect(checkPassword("abc123", h)).toBe(true);
    expect(checkPassword("nope", h)).toBe(false);
  });
});

describe("abonnement", () => {
  beforeEach(useTempDb);
  afterEach(() => {
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.BILLING_PAYWALL;
    delete process.env.PRICE_COFONDATEUR_XAF;
  });

  it("prix marqués exemple sauf si configurés", () => {
    expect(getPlans().find((p) => p.id === "cofondateur")?.priceIsExample).toBe(true);
    process.env.PRICE_COFONDATEUR_XAF = "15000";
    const p = getPlans().find((x) => x.id === "cofondateur")!;
    expect(p.priceXaf).toBe(15000);
    expect(p.priceIsExample).toBe(false);
    expect(getPlans()[0].paid).toBe(false);
  });

  it("le compte démo abonné a accès ; le gratuit non ; activation simulée", async () => {
    const freddy = await demoLogin("usr_demo_freddy");
    const awa = await demoLogin("usr_demo_awa");
    expect(await hasAssistantAccess(freddy)).toBe(true);
    expect(await hasAssistantAccess(awa)).toBe(false);
    expect(await hasAssistantAccess(null)).toBe(false);
    const res = await checkout(awa, "cofondateur", "http://x", true);
    expect(res.status).toBe("active");
    expect(await hasAssistantAccess(awa)).toBe(true);
    await cancelSubscription(awa.id);
    expect(await hasAssistantAccess(awa)).toBe(false);
  });

  it("prestataire réel non configuré : repli simulation (jamais bloquant)", async () => {
    process.env.PAYMENT_PROVIDER = "cinetpay";
    const u = await signup("c@exemple.com", "C");
    const res = await checkout(u, "cofondateur", "http://x");
    expect(res.status).toBe("active");
    expect(res.fallbackReason).toMatch(/non configuré/);
  });

  it("BILLING_PAYWALL=off ouvre l'assistant", async () => {
    process.env.BILLING_PAYWALL = "off";
    expect(await hasAssistantAccess(null)).toBe(true);
  });

  it("référence inconnue refusée", async () => {
    await expect(confirmSubscription("NOPE")).rejects.toThrow();
  });

  it("signatures webhook Stripe et HMAC", () => {
    const payload = '{"a":1}';
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", "whsec").update(`${t}.${payload}`).digest("hex");
    expect(verifyStripeSignature(payload, `t=${t},v1=${v1}`, "whsec")).toBe(true);
    expect(verifyStripeSignature(payload, `t=${t},v1=${v1}`, "autre")).toBe(false);
    const sig = createHmac("sha256", "k").update(payload).digest("hex");
    expect(verifyHmacSignature(payload, sig, "k")).toBe(true);
    expect(verifyHmacSignature(payload, "bad", "k")).toBe(false);
  });
});
