/**
 * Plans d'abonnement. Les PRIX sont des EXEMPLES à confirmer par Freddy :
 * ils peuvent être fixés par variables d'environnement (PRICE_COFONDATEUR_XAF, PRICE_EQUIPE_XAF).
 */
export type Plan = {
  id: "gratuit" | "cofondateur" | "equipe";
  name: string;
  tagline: string;
  priceXaf: number;
  period: "mois";
  priceIsExample: boolean;
  paid: boolean;
  features: string[];
  /** Indications commerciales affichées, NON appliquées techniquement (à décider). */
  indicative?: string[];
  highlight?: boolean;
};

const envPrice = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? { price: Math.round(v), example: false } : { price: fallback, example: true };
};

export function getPlans(): Plan[] {
  const solo = envPrice("PRICE_COFONDATEUR_XAF", 9900);
  const team = envPrice("PRICE_EQUIPE_XAF", 29900);
  return [
    {
      id: "gratuit",
      name: "Gratuit",
      tagline: "Comprendre ses droits, sans compte",
      priceXaf: 0,
      period: "mois",
      priceIsExample: false,
      paid: false,
      features: [
        "Chat juridique sourcé (textes officiels, pages et articles cités)",
        "Recherche dans le corpus de textes de loi",
        "Lecture des articles et des PDF officiels",
        "Saisie et lecture vocales, mode hors-ligne (PWA)",
        "Aucun compte requis",
      ],
    },
    {
      id: "cofondateur",
      name: "Co-fondateur IA",
      tagline: "L'assistant qui agit pour votre startup",
      priceXaf: solo.price,
      period: "mois",
      priceIsExample: solo.example,
      paid: true,
      highlight: true,
      features: [
        "Tout le plan Gratuit",
        "Agent co-fondateur qui agit (emails, fournisseurs, devis, relances, tâches)",
        "Workspace entreprise : documents, démarches, journal d'audit",
        "Business plan, roadmap, statuts, contrats générés",
        "Score de conformité, calendrier des obligations, veille réglementaire",
        "File d'approbation avant toute action externe",
      ],
      indicative: ["Pensé pour 1 entreprise et 3 membres (indicatif, non limité techniquement)"],
    },
    {
      id: "equipe",
      name: "Équipe / Incubateur",
      tagline: "Plusieurs entreprises, plusieurs équipes",
      priceXaf: team.price,
      period: "mois",
      priceIsExample: team.example,
      paid: true,
      features: ["Tout le plan Co-fondateur IA", "Multi-entreprises et membres illimités", "Accompagnement de portefeuille (incubateurs, cabinets)"],
      indicative: ["Plusieurs entreprises et membres (indicatif, non limité techniquement)"],
    },
  ];
}

export function getPlan(id: string): Plan | undefined {
  return getPlans().find((p) => p.id === id);
}
