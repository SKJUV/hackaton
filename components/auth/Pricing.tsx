"use client";

import { Check, CreditCard, Loader2, Smartphone, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { Plan } from "@/lib/billing/plans";
import { AuthShell } from "./AuthForms";
import { getMe, post, queryParam, type Me } from "./client";

type PlansResponse = { plans: Plan[]; provider: { id: string; configured: boolean }; paywall: boolean };

const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;

export function PricingView({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<PlansResponse | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void fetch("/api/billing/plans", { cache: "no-store" }).then((r) => r.json()).then(setData);
    void getMe().then(setMe);
    const p = queryParam("paiement");
    if (p === "en_attente") setNotice("Paiement en attente de confirmation par le prestataire.");
    if (p === "erreur") setError("Le paiement n'a pas pu être vérifié.");
  }, []);

  async function activate(planId: string, simulation: boolean) {
    setBusy(`${planId}-${simulation}`);
    setError("");
    try {
      if (!me?.user) await post("/api/auth/guest"); // jamais bloquant : session invité automatique
      const res = await post<{ status: string; url?: string; fallbackReason?: string }>("/api/billing/checkout", { planId, simulation });
      if (res.status === "redirect" && res.url) {
        window.location.href = res.url;
        return;
      }
      window.location.href = "/workspace?abonnement=active";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="au-muted">Chargement des offres…</p>;
  const realProvider = data.provider.id !== "simulation" && data.provider.configured;
  const canSimulate = !realProvider || !me?.user || me.user.kind !== "standard";

  return (
    <div className="pr-wrap">
      {!compact && (
        <div className="pr-intro">
          <p>Le chat juridique, la recherche de textes et la lecture des articles sont <strong>gratuits et sans compte</strong>. L&apos;assistant co-fondateur qui agit (emails, fournisseurs, workspace) est payant.</p>
          {data.plans.some((p) => p.priceIsExample) && <p className="pr-example">💡 Prix d&apos;exemple, à confirmer par Freddy (configurables via PRICE_COFONDATEUR_XAF / PRICE_EQUIPE_XAF).</p>}
        </div>
      )}
      {notice && <p className="au-ok">{notice}</p>}
      {error && <p className="au-error">{error}</p>}
      <div className="pr-grid">
        {data.plans.map((plan) => {
          const current = me?.subscription?.planId === plan.id || (!plan.paid && !me?.subscription);
          return (
            <article key={plan.id} className={`pr-card ${plan.highlight ? "is-highlight" : ""}`}>
              {plan.highlight && <span className="pr-ribbon">Recommandé</span>}
              <h3>{plan.name}</h3>
              <p className="au-muted">{plan.tagline}</p>
              <div className="pr-price">
                {plan.priceXaf === 0 ? <strong>0 FCFA</strong> : <><strong>{fcfa(plan.priceXaf)}</strong><span>/ {plan.period}</span></>}
              </div>
              {plan.priceIsExample && <span className="pr-badge">Prix d&apos;exemple</span>}
              <ul>{plan.features.map((f) => <li key={f}><Check size={14} /> {f}</li>)}</ul>
              {plan.indicative?.map((i) => <p key={i} className="pr-indicative">{i}</p>)}
              <div className="pr-actions">
                {!plan.paid ? (
                  <a className="au-btn au-wide" href="/">{current ? "Plan actuel — ouvrir l'assistant juridique" : "Utiliser gratuitement"}</a>
                ) : current ? (
                  <a className="au-btn au-btn-primary au-wide" href="/workspace">Plan actif — ouvrir le co-fondateur</a>
                ) : (
                  <>
                    {canSimulate && (
                      <button className="au-btn au-btn-primary au-wide" disabled={!!busy} onClick={() => void activate(plan.id, true)}>
                        {busy === `${plan.id}-true` ? <Loader2 size={15} className="au-spin" /> : <Sparkles size={15} />} Activer (démo)
                      </button>
                    )}
                    {realProvider && (
                      <button className="au-btn au-wide" disabled={!!busy} onClick={() => void activate(plan.id, false)}>
                        {data.provider.id === "stripe" ? <CreditCard size={15} /> : <Smartphone size={15} />} Payer {data.provider.id === "stripe" ? "par carte" : "par Mobile Money"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!compact && (
        <p className="au-muted pr-foot">
          Paiement : {realProvider ? `prestataire ${data.provider.id} configuré` : "simulation (aucun débit réel)"}. Mobile Money via agrégateur (CinetPay, NotchPay) ou carte (Stripe), activable par variables d&apos;environnement.
        </p>
      )}
    </div>
  );
}

export function PricingPage() {
  return (
    <AuthShell title="Tarifs" subtitle="Gratuit pour comprendre vos droits. Payant pour avoir un co-fondateur qui agit.">
      <PricingView />
    </AuthShell>
  );
}
