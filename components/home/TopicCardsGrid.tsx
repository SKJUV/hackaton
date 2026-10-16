"use client";

import {
  ArrowUpRight,
  BookOpen,
  Gavel,
  Globe2,
  Package,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
} from "lucide-react";

export const themeCards = [
  {
    id: "telecom",
    title: "Télécoms & Fournisseurs d'accès",
    lawRef: "Loi N° 2010/013 & Décisions ART",
    desc: "Licences, autorisations et démarches pour lancer un FAI ou un réseau.",
    prompt: "Quelles sont les démarches et licences pour fournir Internet ou déployer un réseau au Cameroun ?",
    icon: Globe2,
    tint: "cyan",
  },
  {
    id: "consommateurs",
    title: "Protection du Consommateur",
    lawRef: "Loi-Cadre N° 2011/012",
    desc: "Recours en cas de facturation abusive, coupure de service ou litige opérateur.",
    prompt: "Quels sont mes droits et mes recours si mon opérateur de téléphonie ou d'accès me facture indûment ?",
    icon: ShieldAlert,
    tint: "rose",
  },
  {
    id: "cybersecurite",
    title: "Cybersécurité & Données",
    lawRef: "Loi N° 2010/012 & Rôle ANTIC",
    desc: "Obligations de protection des données, audits de sécurité et sanctions de piratage.",
    prompt: "Quelles sont les obligations de cybersécurité et de protection des données personnelles selon la loi 2010/012 ?",
    icon: ShieldCheck,
    tint: "violet",
  },
  {
    id: "ecommerce",
    title: "Commerce & Contrats en ligne",
    lawRef: "Loi N° 2010/021",
    desc: "Règles applicables aux plateformes web, signatures électroniques et ventes en ligne.",
    prompt: "Quelles sont les règles légales obligatoires pour vendre en ligne et signer des contrats à distance au Cameroun ?",
    icon: ShoppingBag,
    tint: "amber",
  },
  {
    id: "postes",
    title: "Colis, Courrier & Logistique",
    lawRef: "Réglementation Postale",
    desc: "Régime de licence et de déclaration pour la livraison et le transport de colis.",
    prompt: "Je veux lancer une entreprise de livraison de colis au Cameroun. Quel régime postal et quelles licences s'appliquent ?",
    icon: Package,
    tint: "indigo",
  },
  {
    id: "concurrence",
    title: "Concurrence & Tarification",
    lawRef: "Loi N° 98/013 Concurrence",
    desc: "Interdiction des ententes, abus de position dominante et fixation des tarifs.",
    prompt: "Que prévoit le droit camerounais contre les pratiques anticoncurrentielles et les abus de position dominante ?",
    icon: Gavel,
    tint: "emerald",
  },
];

export function TopicCardsGrid({
  onSelectCard,
  loading,
}: {
  onSelectCard: (prompt: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="card-grid-section">
      <div className="card-grid-header">
        <span className="card-grid-eyebrow">Domaines réglementés</span>
        <span className="card-grid-subtitle">
          Sélectionnez un thème pour interroger directement les textes officiels
        </span>
      </div>

      <div className="cards-modular-grid">
        {themeCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              className={`modular-card card-${card.tint}`}
              type="button"
              disabled={loading}
              onClick={() => onSelectCard(card.prompt)}
              style={{ "--stagger-delay": `${index * 60}ms` } as React.CSSProperties}
            >
              <div className="modular-card-top">
                <span className={`modular-card-icon icon-${card.tint}`}>
                  <Icon size={20} strokeWidth={1.8} />
                </span>
                <span className="modular-card-badge">{card.lawRef}</span>
                <span className="modular-card-arrow">
                  <ArrowUpRight size={17} />
                </span>
              </div>

              <div className="modular-card-body">
                <h3 className="modular-card-title">{card.title}</h3>
                <p className="modular-card-desc">{card.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
