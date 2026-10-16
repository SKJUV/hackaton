import { newId, nowIso, readData, withData } from "@/lib/workspace/store";
import type { Subscription, User } from "@/lib/workspace/types";
import { getPlan } from "./plans";
import { configuredProvider, confirmPayment, startCheckout, type ProviderId } from "./providers";

export class BillingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Paywall activable/désactivable : BILLING_PAYWALL=off ouvre l'assistant à tous (dev). */
export function paywallEnabled(): boolean {
  return (process.env.BILLING_PAYWALL || "on").toLowerCase() !== "off";
}

export function isActive(sub: Subscription, now = Date.now()): boolean {
  return sub.status === "active" && (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd).getTime() > now);
}

export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  const data = await readData();
  return data.subscriptions.filter((s) => s.userId === userId && isActive(s)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export async function hasAssistantAccess(user: User | null): Promise<boolean> {
  if (!paywallEnabled()) return true;
  if (!user) return false;
  const sub = await getActiveSubscription(user.id);
  return Boolean(sub && getPlan(sub.planId)?.paid);
}

const addMonth = (d = new Date()) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1);
  return x.toISOString();
};

/**
 * Démarre un abonnement.
 *  - simulation : activation immédiate (toujours disponible pour les comptes démo/invités,
 *    et pour tous tant qu'aucun prestataire réel n'est configuré) ;
 *  - prestataire réel : redirection vers sa page de paiement, activation au retour/webhook.
 */
export async function checkout(user: User, planId: string, baseUrl: string, forceSimulation = false) {
  const plan = getPlan(planId);
  if (!plan || !plan.paid) throw new BillingError("Plan inconnu ou gratuit.");
  const provider = configuredProvider();
  const canSimulate = provider.id === "simulation" || user.kind !== "standard" || forceSimulation;
  const useSimulation = provider.id === "simulation" || (forceSimulation && canSimulate) || !provider.configured;
  if (forceSimulation && !canSimulate) throw new BillingError("La simulation est réservée aux comptes démo quand un prestataire réel est configuré.", 403);
  const providerId: ProviderId = useSimulation ? "simulation" : provider.id;

  const sub = await withData((data) => {
    const s: Subscription = {
      id: newId("sub"),
      userId: user.id,
      planId: plan.id,
      status: providerId === "simulation" ? "active" : "en_attente",
      provider: providerId,
      simulated: providerId === "simulation",
      reference: `DCM-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      amount: plan.priceXaf,
      currency: "XAF",
      startedAt: providerId === "simulation" ? nowIso() : undefined,
      currentPeriodEnd: providerId === "simulation" ? addMonth() : undefined,
      createdAt: nowIso(),
    };
    if (providerId === "simulation") {
      for (const old of data.subscriptions) if (old.userId === user.id && old.status === "active") old.status = "annulee";
    }
    data.subscriptions.push(s);
    return s;
  });
  if (providerId === "simulation") return { status: "active" as const, subscription: sub, simulated: true, fallbackReason: provider.id !== "simulation" && !provider.configured ? `Prestataire ${provider.id} non configuré (${provider.missing}) : simulation utilisée.` : undefined };

  const base = baseUrl.replace(/\/$/, "");
  const result = await startCheckout(providerId, {
    reference: sub.reference,
    amount: plan.priceXaf,
    currency: "XAF",
    description: `Droit.cm — ${plan.name} (1 mois)`,
    customerEmail: user.email,
    customerName: user.name,
    returnUrl: `${base}/api/billing/return?ref=${sub.reference}`,
    notifyUrl: `${base}/api/billing/webhook/${providerId}`,
  });
  if (result.kind === "redirect") return { status: "redirect" as const, url: result.url, subscription: sub, simulated: false };
  await withData((data) => {
    const s = data.subscriptions.find((x) => x.id === sub.id);
    if (s) s.status = "annulee";
  });
  throw new BillingError(result.kind === "error" ? result.message : "Paiement impossible.", 502);
}

/** Active une souscription en attente après confirmation du prestataire (retour ou webhook). */
export async function confirmSubscription(reference: string, extra: Record<string, string> = {}) {
  const data = await readData();
  const sub = data.subscriptions.find((s) => s.reference === reference);
  if (!sub) throw new BillingError("Référence inconnue.", 404);
  if (sub.status === "active") return sub;
  const paid = await confirmPayment(sub.provider as ProviderId, reference, extra);
  if (!paid) return sub;
  return withData((d) => {
    const s = d.subscriptions.find((x) => x.reference === reference)!;
    for (const old of d.subscriptions) if (old.userId === s.userId && old.status === "active" && old.id !== s.id) old.status = "annulee";
    s.status = "active";
    s.startedAt = nowIso();
    s.currentPeriodEnd = addMonth();
    return s;
  });
}

export async function cancelSubscription(userId: string) {
  return withData((data) => {
    const subs = data.subscriptions.filter((s) => s.userId === userId && s.status === "active");
    if (!subs.length) throw new BillingError("Aucun abonnement actif.", 404);
    for (const s of subs) {
      s.status = "annulee";
      s.canceledAt = nowIso();
    }
    return subs.length;
  });
}

export async function listSubscriptions(userId: string) {
  return (await readData()).subscriptions.filter((s) => s.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
