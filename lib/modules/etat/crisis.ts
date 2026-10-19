import { AID_PROGRAMS, DEMO_BANNER, DEMO_NOTICE, PROFILES, seriesById, type ProfileId } from "./seed";

/**
 * Module crise (DÉMO). Méthode volontairement simple et lisible, inspirée de l'approche générique « par signaux »
 * des systèmes d'alerte précoce : chaque indicateur précurseur est comparé à un seuil de vigilance et à un seuil
 * critique, puis agrégé par type de crise avec des poids affichés. Les SEUILS et POIDS sont des valeurs d'EXEMPLE
 * à calibrer par les services de l'État ; les séries sont fictives.
 */

/** Requête au corpus officiel pour les communiqués et plans de crise (protection du consommateur). */
export const COMMUNIQUE_QUERY = "protection du consommateur prix abusifs information du consommateur";

export type CrisisType = "change" | "approvisionnement" | "matieres_premieres";
export const CRISIS_LABELS: Record<CrisisType, string> = {
  change: "Crise de change",
  approvisionnement: "Crise d'approvisionnement",
  matieres_premieres: "Choc sur les matières premières exportées",
};

export type LeadingIndicator = {
  id: string;
  label: string;
  unit: string;
  /** Sens du danger : « down » = une baisse est dangereuse. */
  danger: "up" | "down";
  vigilance: number;
  critical: number;
  values: number[];
};

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 1000) / 10;

/** Indicateurs précurseurs, dérivés des séries de démo. Seuils = EXEMPLES. */
export function leadingIndicators(): LeadingIndicator[] {
  const fx = seriesById("change_xaf_usd").values;
  const exp = seriesById("indice_matieres_export").values;
  const dep3 = fx.map((v, i) => (i >= 3 ? pct(v, fx[i - 3]) : 0));
  const exp6 = exp.map((v, i) => (i >= 6 ? pct(v, exp[i - 6]) : 0));
  return [
    { id: "reserves", label: "Réserves de change", unit: "mois d'importations", danger: "down", vigilance: 4, critical: 3, values: seriesById("reserves_mois_import").values },
    { id: "depreciation", label: "Dépréciation du FCFA face au USD sur 3 périodes", unit: "%", danger: "up", vigilance: 2, critical: 5, values: dep3 },
    { id: "inflation_alimentaire", label: "Inflation alimentaire", unit: "% sur 12 mois", danger: "up", vigilance: 8, critical: 12, values: seriesById("inflation_alimentaire").values },
    { id: "stocks", label: "Stocks de céréales", unit: "semaines", danger: "down", vigilance: 7, critical: 4, values: seriesById("stock_cereales_semaines").values },
    { id: "prix_export", label: "Prix des matières premières exportées sur 6 périodes", unit: "%", danger: "down", vigilance: -8, critical: -15, values: exp6 },
    { id: "balance", label: "Balance commerciale mensuelle", unit: "Md FCFA", danger: "down", vigilance: -60, critical: -100, values: seriesById("balance_commerciale").values },
  ];
}

export const CRISIS_WEIGHTS: Record<CrisisType, Record<string, number>> = {
  change: { reserves: 0.4, depreciation: 0.35, balance: 0.25 },
  approvisionnement: { stocks: 0.5, inflation_alimentaire: 0.3, depreciation: 0.2 },
  matieres_premieres: { prix_export: 0.5, balance: 0.3, reserves: 0.2 },
};

/** 0 = sain, 50 = seuil de vigilance, 100 = seuil critique (ou au-delà). Linéaire. */
export function indicatorScore(ind: Pick<LeadingIndicator, "vigilance" | "critical">, value: number) {
  const span = ind.critical - ind.vigilance;
  const safe = ind.vigilance - span;
  const s = ((value - safe) / (ind.critical - safe)) * 100;
  return Math.round(Math.max(0, Math.min(100, s)));
}

/**
 * Fenêtre d'action : nombre de périodes avant d'atteindre le seuil critique si la tendance des 3 dernières
 * périodes se poursuit (extrapolation linéaire). 0 = déjà franchi ; null = pas de franchissement projeté.
 */
export function periodsToCritical(ind: LeadingIndicator): number | null {
  const v = ind.values;
  const last = v[v.length - 1];
  const crossed = ind.danger === "up" ? last >= ind.critical : last <= ind.critical;
  if (crossed) return 0;
  const slope = (last - v[v.length - 4]) / 3;
  const worsening = ind.danger === "up" ? slope > 0 : slope < 0;
  if (!worsening) return null;
  return Math.round(((ind.critical - last) / slope) * 10) / 10;
}

export const DAYS_PER_PERIOD = 30;
export type RiskLevel = "faible" | "vigilance" | "eleve" | "critique";
export const levelOf = (score: number): RiskLevel => (score >= 80 ? "critique" : score >= 60 ? "eleve" : score >= 35 ? "vigilance" : "faible");

const PREVENTIVE: Record<CrisisType, string[]> = {
  change: [
    "Coordonner avec les autorités monétaires compétentes sur l'état des réserves (piste à évaluer).",
    "Prioriser les importations essentielles (médicaments, denrées de base, intrants) dans les procédures existantes (piste à évaluer).",
    "Préparer une communication publique factuelle pour éviter les achats de précaution en devises.",
  ],
  approvisionnement: [
    "Faire l'inventaire des stocks publics et privés déclarés, région par région.",
    "Préparer des circuits d'acheminement vers les régions les plus tendues (voir tableau macro).",
    "Activer la surveillance des prix sur les marchés et le signalement des pratiques abusives.",
  ],
  matieres_premieres: [
    "Évaluer l'impact sur les recettes publiques et les revenus des producteurs exportateurs.",
    "Préparer des mesures d'accompagnement ciblées pour les filières exposées (à simuler dans le simulateur).",
    "Informer les producteurs sur les options de stockage et de diversification.",
  ],
};

export type CrisisAlert = {
  type: CrisisType;
  label: string;
  score: number;
  level: RiskLevel;
  actionWindow: { periods: number | null; days: number | null; label: string };
  drivers: { id: string; label: string; value: number; unit: string; score: number; weight: number; periodsToCritical: number | null }[];
  preventiveActions: string[];
};

export function assessCrises(): { banner: string; notice: string; isDemo: true; method: string; indicators: (LeadingIndicator & { latest: number; score: number; periodsToCritical: number | null })[]; alerts: CrisisAlert[] } {
  const inds = leadingIndicators().map((i) => ({ ...i, latest: i.values[i.values.length - 1], score: indicatorScore(i, i.values[i.values.length - 1]), periodsToCritical: periodsToCritical(i) }));
  const byId = new Map(inds.map((i) => [i.id, i]));
  const alerts = (Object.keys(CRISIS_WEIGHTS) as CrisisType[]).map((type) => {
    const drivers = Object.entries(CRISIS_WEIGHTS[type]).map(([id, weight]) => {
      const i = byId.get(id)!;
      return { id, label: i.label, value: i.latest, unit: i.unit, score: i.score, weight, periodsToCritical: i.periodsToCritical };
    });
    const score = Math.round(drivers.reduce((s, d) => s + d.score * d.weight, 0));
    const windows = drivers.map((d) => d.periodsToCritical).filter((p): p is number => p !== null);
    const periods = windows.length ? Math.min(...windows) : null;
    const days = periods === null ? null : Math.round(periods * DAYS_PER_PERIOD);
    const label = periods === null ? "Pas de franchissement projeté du seuil critique" : periods === 0 ? "Seuil critique déjà franchi : action immédiate" : `Environ ${days} jours avant le seuil critique (tendance actuelle prolongée)`;
    return { type, label: CRISIS_LABELS[type], score, level: levelOf(score), actionWindow: { periods, days, label }, drivers: drivers.sort((a, b) => b.score * b.weight - a.score * a.weight), preventiveActions: PREVENTIVE[type] };
  });
  return {
    banner: DEMO_BANNER,
    notice: DEMO_NOTICE,
    isDemo: true,
    method:
      "Score indicateur : 0 = sain, 50 = seuil de vigilance, 100 = seuil critique (linéaire). Risque de crise = somme pondérée des scores (poids affichés). Fenêtre d'action = périodes avant le seuil critique si la tendance des 3 dernières périodes se poursuit, 1 période = 30 jours. Seuils et poids : valeurs d'EXEMPLE à calibrer.",
    indicators: inds,
    alerts: alerts.sort((a, b) => b.score - a.score),
  };
}

/* ------------------------------------------------ Communication citoyenne */

type Msg = { stock: string[]; consommation: string[] };
const BY_TYPE: Record<CrisisType, Msg> = {
  change: {
    stock: ["Pas besoin de stocker : les produits restent disponibles. Gardez simplement vos achats habituels."],
    consommation: ["Privilégiez les produits locaux, moins sensibles au prix du dollar.", "Reportez les achats importés non urgents (électronique, pièces non indispensables)."],
  },
  approvisionnement: {
    stock: ["Une réserve raisonnable de produits de base pour quelques jours suffit (ex. céréales, huile, savon). N'achetez pas au-delà : cela crée la pénurie."],
    consommation: ["Variez les produits (maïs, manioc, plantain, riz) selon ce qui est disponible localement.", "Regroupez les achats entre voisins pour réduire les déplacements."],
  },
  matieres_premieres: {
    stock: ["Aucun stockage de précaution n'est nécessaire pour les ménages."],
    consommation: ["Anticipez une possible baisse de revenus si vous travaillez dans une filière d'exportation : constituez une petite épargne de sécurité."],
  },
};

const BY_PROFILE: Record<ProfileId, Partial<Record<CrisisType, string[]>> & { general: string[] }> = {
  agriculteur: {
    general: ["Ne bradez pas votre récolte sous l'effet de rumeurs : comparez les prix de plusieurs marchés.", "Conservez des semences pour la prochaine saison."],
    approvisionnement: ["Si vous avez des stocks, étalez vos ventes : les prix élevés ne justifient pas de vendre les réserves de la famille."],
    matieres_premieres: ["Si votre culture d'exportation baisse, renseignez-vous sur le stockage (warrantage) avant de vendre à perte."],
  },
  famille: {
    general: ["Faites un budget simple de la semaine : alimentation d'abord, puis transport, puis le reste.", "Achetez en quantités habituelles ; le stockage massif fait monter les prix pour tout le monde."],
    change: ["Les produits importés peuvent augmenter : comparez avec des équivalents locaux."],
  },
  artisan: {
    general: ["Négociez avec vos fournisseurs des achats de matières premières étalés plutôt qu'un gros stock.", "Affichez clairement vos prix et prévenez vos clients avant toute hausse."],
    change: ["Si vos intrants sont importés, demandez des devis à plusieurs fournisseurs et regardez les alternatives locales."],
  },
  commercant: {
    general: ["Gardez vos prix affichés et justifiés : les hausses abusives aggravent la panique et peuvent être sanctionnées (voir références juridiques).", "Limitez les quantités par client en cas de ruée, pour servir tout le monde."],
    approvisionnement: ["Signalez rapidement aux autorités les ruptures chez vos grossistes."],
  },
  transporteur: {
    general: ["Partagez les trajets et optimisez les tournées pour limiter la consommation de carburant.", "Ne relayez pas de rumeurs de pénurie de carburant non vérifiées."],
    approvisionnement: ["Votre rôle est clé pour acheminer les denrées : coordonnez-vous avec votre syndicat et les autorités locales."],
  },
};

export const ANTI_PANIC = [
  "Une seule source de référence : les communiqués officiels. Vérifiez avant de partager un message.",
  "Achetez comme d'habitude : la ruée sur les produits crée elle-même la pénurie.",
  "Les hausses de prix ne sont pas toutes durables : comparez plusieurs marchés avant d'acheter en grande quantité.",
  "Signalez les prix abusifs et les rétentions de stock aux services compétents.",
  "Pensez aux personnes vulnérables de votre entourage (personnes âgées, malades).",
];

export const CHANNELS = [
  { channel: "Radio communautaire et nationale", why: "Large portée, y compris rurale et sans internet." },
  { channel: "SMS / messages vocaux en langues locales", why: "Message court et direct, accessible sans smartphone." },
  { channel: "Relais communautaires (chefferies, associations, églises, mosquées)", why: "Confiance et proximité." },
  { channel: "Réseaux sociaux officiels", why: "Démentir rapidement les rumeurs." },
];

export type CommunicationPlan = {
  banner: string;
  isDemo: true;
  crisis: CrisisType;
  crisisLabel: string;
  timeline: { when: string; action: string }[];
  channels: typeof CHANNELS;
  antiPanic: string[];
  segments: { profile: ProfileId; label: string; keyMessage: string; stock: string[]; consommation: string[]; conseils: string[]; aides: { name: string; benefit: string; howTo: string; isExample: true }[] }[];
};

export function communicationPlan(type: CrisisType = "approvisionnement", profiles?: string[]): CommunicationPlan {
  const selected = PROFILES.filter((p) => !profiles?.length || profiles.includes(p.id));
  return {
    banner: DEMO_BANNER,
    isDemo: true,
    crisis: type,
    crisisLabel: CRISIS_LABELS[type],
    timeline: [
      { when: "J0", action: "Message officiel unique : la situation, ce que fait l'État, ce que chacun peut faire. Démenti des rumeurs." },
      { when: "J+1 à J+3", action: "Messages segmentés par profil (ci-dessous) sur les canaux de proximité ; ouverture d'un numéro d'information." },
      { when: "J+7", action: "Point de situation chiffré (données officielles) et rappel des aides disponibles." },
      { when: "Fin de crise", action: "Message de sortie de crise et retour d'expérience." },
    ],
    channels: CHANNELS,
    antiPanic: ANTI_PANIC,
    segments: selected.map((p) => ({
      profile: p.id,
      label: p.label,
      keyMessage: `Restez informé par les canaux officiels, achetez normalement et utilisez les aides auxquelles vous avez droit.`,
      stock: BY_TYPE[type].stock,
      consommation: BY_TYPE[type].consommation,
      conseils: [...(BY_PROFILE[p.id][type] ?? []), ...BY_PROFILE[p.id].general],
      aides: AID_PROGRAMS.filter((a) => a.profiles.includes(p.id)).map((a) => ({ name: a.name, benefit: a.benefit, howTo: a.howTo, isExample: a.isExample })),
    })),
  };
}

export function isCrisisType(v: unknown): v is CrisisType {
  return v === "change" || v === "approvisionnement" || v === "matieres_premieres";
}

/** Communiqué Markdown (à valider) à partir du plan. */
export function communiqueMarkdown(plan: CommunicationPlan, profile?: string) {
  const segs = plan.segments.filter((s) => !profile || s.profile === profile);
  const lines = [
    `# Communiqué citoyen — ${plan.crisisLabel}`,
    "",
    `> **${DEMO_BANNER}.** Projet de communiqué généré en démonstration, à valider par la cellule de communication avant toute diffusion.`,
    "",
    "## Ce que chacun peut faire",
    ...plan.antiPanic.map((x) => `- ${x}`),
    "",
    ...segs.flatMap((s) => [
      `## ${s.label}`,
      s.keyMessage,
      ...s.stock.map((x) => `- ${x}`),
      ...s.consommation.map((x) => `- ${x}`),
      ...s.conseils.map((x) => `- ${x}`),
      ...(s.aides.length ? ["", "Aides (EXEMPLES, non officielles) :", ...s.aides.map((a) => `- ${a.name} — ${a.benefit}`)] : []),
      "",
    ]),
    "## Calendrier de diffusion",
    ...plan.timeline.map((t) => `- **${t.when}** : ${t.action}`),
  ];
  return lines.join("\n");
}
