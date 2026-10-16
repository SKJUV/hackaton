import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Prestataires de paiement. PAYMENT_PROVIDER = simulation (défaut) | cinetpay | notchpay | stripe.
 * Les intégrations réelles sont écrites d'après la documentation publique des prestataires
 * et n'ont PAS été testées contre leurs API (aucune clé disponible) : à valider en sandbox.
 */
export type ProviderId = "simulation" | "cinetpay" | "notchpay" | "stripe";

export type CheckoutInput = {
  reference: string;
  amount: number;
  currency: "XAF";
  description: string;
  customerEmail: string;
  customerName: string;
  returnUrl: string;
  notifyUrl: string;
};

export type CheckoutResult = { kind: "activated" } | { kind: "redirect"; url: string } | { kind: "error"; message: string };

export function configuredProvider(): { id: ProviderId; configured: boolean; missing?: string } {
  const id = (process.env.PAYMENT_PROVIDER || "simulation").toLowerCase() as ProviderId;
  const need: Record<ProviderId, string[]> = {
    simulation: [],
    cinetpay: ["CINETPAY_API_KEY", "CINETPAY_SITE_ID"],
    notchpay: ["NOTCHPAY_PUBLIC_KEY"],
    stripe: ["STRIPE_SECRET_KEY"],
  };
  if (!(id in need)) return { id: "simulation", configured: true };
  const missing = need[id].filter((k) => !process.env[k]);
  return { id, configured: missing.length === 0, missing: missing.length ? missing.join(", ") : undefined };
}

async function cinetpay(input: CheckoutInput): Promise<CheckoutResult> {
  const res = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey: process.env.CINETPAY_API_KEY,
      site_id: process.env.CINETPAY_SITE_ID,
      transaction_id: input.reference,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      return_url: input.returnUrl,
      notify_url: input.notifyUrl,
      channels: "ALL",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string; data?: { payment_url?: string } };
  if (body.data?.payment_url) return { kind: "redirect", url: body.data.payment_url };
  return { kind: "error", message: body.message || `CinetPay HTTP ${res.status}` };
}

async function notchpay(input: CheckoutInput): Promise<CheckoutResult> {
  const res = await fetch("https://api.notchpay.co/payments/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: process.env.NOTCHPAY_PUBLIC_KEY ?? "" },
    body: JSON.stringify({ amount: input.amount, currency: input.currency, email: input.customerEmail, reference: input.reference, description: input.description, callback: input.returnUrl }),
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as { authorization_url?: string; message?: string };
  if (body.authorization_url) return { kind: "redirect", url: body.authorization_url };
  return { kind: "error", message: body.message || `NotchPay HTTP ${res.status}` };
}

async function stripe(input: CheckoutInput): Promise<CheckoutResult> {
  // XAF est une devise sans décimale chez Stripe : le montant est envoyé tel quel.
  const form = new URLSearchParams({
    mode: "payment",
    success_url: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: input.returnUrl,
    client_reference_id: input.reference,
    customer_email: input.customerEmail,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "xaf",
    "line_items[0][price_data][unit_amount]": String(input.amount),
    "line_items[0][price_data][product_data][name]": input.description,
    "metadata[reference]": input.reference,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (body.url) return { kind: "redirect", url: body.url };
  return { kind: "error", message: body.error?.message || `Stripe HTTP ${res.status}` };
}

export async function startCheckout(provider: ProviderId, input: CheckoutInput): Promise<CheckoutResult> {
  try {
    if (provider === "simulation") return { kind: "activated" };
    if (provider === "cinetpay") return await cinetpay(input);
    if (provider === "notchpay") return await notchpay(input);
    return await stripe(input);
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Erreur de paiement" };
  }
}

/** Vérifie côté prestataire qu'une transaction est payée (référence = notre id de souscription). */
export async function confirmPayment(provider: ProviderId, reference: string, extra: Record<string, string> = {}): Promise<boolean> {
  try {
    if (provider === "cinetpay") {
      const res = await fetch("https://api-checkout.cinetpay.com/v2/payment/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: process.env.CINETPAY_API_KEY, site_id: process.env.CINETPAY_SITE_ID, transaction_id: reference }),
        signal: AbortSignal.timeout(20000),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: { status?: string } };
      return body.data?.status === "ACCEPTED";
    }
    if (provider === "notchpay") {
      const res = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(reference)}`, {
        headers: { Accept: "application/json", Authorization: process.env.NOTCHPAY_PUBLIC_KEY ?? "" },
        signal: AbortSignal.timeout(20000),
      });
      const body = (await res.json().catch(() => ({}))) as { transaction?: { status?: string } };
      return body.transaction?.status === "complete";
    }
    if (provider === "stripe" && extra.session_id) {
      const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(extra.session_id)}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        signal: AbortSignal.timeout(20000),
      });
      const body = (await res.json().catch(() => ({}))) as { payment_status?: string; client_reference_id?: string };
      return body.payment_status === "paid" && body.client_reference_id === reference;
    }
  } catch {
    return false;
  }
  return false;
}

/** Vérification de signature Stripe (en-tête Stripe-Signature : t=…,v1=…). */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vérification HMAC-SHA256 générique (NotchPay : en-tête x-notch-signature). */
export function verifyHmacSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
