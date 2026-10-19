"use client";

import { Bot, Lock, Mail, ShieldCheck, Truck } from "lucide-react";
import { QuickAccess } from "@/components/auth/AuthForms";
import type { Me } from "@/components/auth/client";
import { PricingView } from "@/components/auth/Pricing";

/** Paywall propre de l'assistant payant : explique, propose l'essai démo, ne bloque jamais l'accès gratuit. */
export function Paywall({ me }: { me: Me }) {
  return (
    <div className="ws-paywall au-page">
      <header className="au-top">
        <a href="/" className="au-brand">⚖️ Co-founder</a>
        <nav>
          <a href="/">Assistant juridique (gratuit)</a>
          <a href="/tarifs">Tarifs</a>
          {me.user ? <a href="/compte">{me.user.name}</a> : <a href="/connexion?next=/workspace">Connexion</a>}
        </nav>
      </header>
      <main className="ws-paywall-main">
        <div className="ws-paywall-hero">
          <span className="ws-paywall-lock"><Lock size={18} /> Offre Co-fondateur IA</span>
          <h1>Un co-fondateur qui agit pour votre startup</h1>
          <p>Il rédige et envoie vos emails après validation, contacte les fournisseurs et suit les devis, pilote vos démarches, génère business plan, statuts et contrats, et surveille votre conformité.</p>
          <div className="ws-paywall-points">
            <span><Bot size={15} /> Agent à outils</span>
            <span><Mail size={15} /> Emails & relances</span>
            <span><Truck size={15} /> Fournisseurs & devis</span>
            <span><ShieldCheck size={15} /> Validation humaine</span>
          </div>
          <p className="au-muted">Le chat juridique, la recherche de textes et la lecture des articles restent <strong>gratuits</strong> : <a href="/">ouvrir l&apos;assistant juridique</a>.</p>
        </div>
        {!me.user && (
          <div className="ws-paywall-quick">
            <h3>Essayer tout de suite, sans mot de passe</h3>
            <p className="au-muted">Le compte démo « Freddy Choudja (démo · abonné) » a déjà un abonnement simulé actif.</p>
            <QuickAccess next="/workspace" />
          </div>
        )}
        <PricingView compact />
      </main>
    </div>
  );
}
