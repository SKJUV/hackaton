import { DEMO_BANNER, DEMO_NOTICE, PROFILES, REGIONS, SECTORS, type Category, type ProfileId, type SectorId } from "./seed";

/**
 * Simulateur de politiques (DÉMO) — modèle linéaire volontairement simple et TRANSPARENT :
 *  1. la mesure modifie les prix de 4 catégories de dépenses (taux de répercussion affichés) ;
 *  2. les secteurs réagissent (coûts d'intrants + demande, élasticités affichées) ;
 *  3. chaque profil voit son coût de la vie (panier) et son revenu (secteur, transferts) évoluer ;
 *  4. chaque région est pondérée par sa structure fictive (agriculture, importations, éloignement) ;
 *  5. l'effet budgétaire est calculé sur des assiettes fictives.
 * Toutes les hypothèses sont des VALEURS D'EXEMPLE, modifiables, et renvoyées avec le résultat.
 * Ce n'est pas un modèle de prévision : il sert à raisonner et à repérer les effets non intentionnels.
 */

export type MeasureKind = "tva" | "subvention" | "droit_douane" | "carburant" | "transfert";
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "alimentation", label: "Alimentation" },
  { id: "energie_transport", label: "Énergie & transport" },
  { id: "biens_importes", label: "Biens importés" },
  { id: "services", label: "Services" },
];

export const MEASURES: { id: MeasureKind; label: string; valueLabel: string; defaultValue: number; min: number; max: number; target: "categorie" | "profils" | "aucune"; defaultTarget?: string; help: string }[] = [
  { id: "tva", label: "Variation du taux de TVA", valueLabel: "points de TVA (ex. +2 ou -5)", defaultValue: 2, min: -20, max: 20, target: "categorie", defaultTarget: "biens_importes", help: "Modifie le taux de TVA sur une catégorie (ou toutes)." },
  { id: "subvention", label: "Subvention sectorielle des prix", valueLabel: "% du prix subventionné", defaultValue: 10, min: 0, max: 50, target: "categorie", defaultTarget: "alimentation", help: "L'État prend en charge une part du prix d'une catégorie." },
  { id: "droit_douane", label: "Variation des droits de douane", valueLabel: "points de droit de douane", defaultValue: 5, min: -30, max: 30, target: "aucune", help: "Modifie les droits sur les importations (biens importés et part importée de l'alimentation)." },
  { id: "carburant", label: "Variation du prix du carburant", valueLabel: "% de variation du prix à la pompe", defaultValue: 15, min: -50, max: 80, target: "aucune", help: "Ex. réduction d'une subvention ou d'une taxe sur le carburant." },
  { id: "transfert", label: "Transfert monétaire ciblé", valueLabel: "FCFA par ménage bénéficiaire et par mois", defaultValue: 15000, min: 0, max: 100000, target: "profils", defaultTarget: "famille,agriculteur", help: "Versement mensuel aux profils ciblés." },
];

/** Requêtes au corpus officiel par mesure (le statut « non couvert » est affiché tel quel). */
export const POLICY_LEGAL_QUERY: Record<MeasureKind, string> = {
  tva: "taxe sur la valeur ajoutée taux fiscalité impôt",
  subvention: "subvention prix soutien État aide",
  droit_douane: "droits de douane importation tarif extérieur commun",
  carburant: "prix des produits pétroliers carburant taxe",
  transfert: "transferts sociaux aide aux ménages protection sociale",
};

export type Assumptions = {
  repercussionTaxe: number;
  repercussionSubvention: number;
  repercussionDouane: number;
  partCarburantEnergie: number;
  elasticiteDemande: number;
  elasticiteEmploi: number;
  partRevenuSecteur: number;
  protectionLocale: number;
};

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  repercussionTaxe: 0.7,
  repercussionSubvention: 0.6,
  repercussionDouane: 0.8,
  partCarburantEnergie: 0.6,
  elasticiteDemande: 0.5,
  elasticiteEmploi: 0.6,
  partRevenuSecteur: 0.5,
  protectionLocale: 0.3,
};

export const ASSUMPTION_INFO: Record<keyof Assumptions, { label: string; description: string; min: number; max: number }> = {
  repercussionTaxe: { label: "Répercussion d'une taxe sur les prix", description: "Part d'une hausse de TVA effectivement payée par le consommateur (secteur formel).", min: 0, max: 1 },
  repercussionSubvention: { label: "Répercussion d'une subvention", description: "Part de la subvention qui arrive réellement au consommateur (le reste est capté en chemin).", min: 0, max: 1 },
  repercussionDouane: { label: "Répercussion des droits de douane", description: "Part d'une hausse de droits répercutée sur le prix des produits importés.", min: 0, max: 1 },
  partCarburantEnergie: { label: "Poids du carburant dans « énergie & transport »", description: "Une hausse de 10 % du carburant renchérit cette catégorie de 10 % × ce poids.", min: 0, max: 1 },
  elasticiteDemande: { label: "Élasticité de l'activité aux prix", description: "Baisse d'activité d'un secteur (%) pour 1 % de hausse de ses coûts.", min: 0, max: 2 },
  elasticiteEmploi: { label: "Élasticité de l'emploi à l'activité", description: "Variation de l'emploi (%) pour 1 % de variation de l'activité.", min: 0, max: 1.5 },
  partRevenuSecteur: { label: "Transmission de l'activité aux revenus", description: "Part de la variation d'activité du secteur qui se retrouve dans le revenu du profil.", min: 0, max: 1 },
  protectionLocale: { label: "Gain de protection pour la production locale", description: "Hausse d'activité (%) de l'agriculture et de l'artisanat pour 1 point de hausse des droits de douane × 100.", min: 0, max: 1 },
};

/** Paramètres structurels FICTIFS (seed), affichés avec le résultat. */
export const STRUCTURE = {
  /** Part formelle des ventes par catégorie (où la TVA s'applique effectivement). */
  partFormelle: { alimentation: 0.3, energie_transport: 0.8, biens_importes: 0.7, services: 0.5 } as Record<Category, number>,
  /** Part importée de chaque catégorie. */
  partImportee: { alimentation: 0.2, energie_transport: 0.5, biens_importes: 1, services: 0.05 } as Record<Category, number>,
  /** Part du coût de transport dans le prix de chaque catégorie (diffusion d'un choc carburant). */
  partTransport: { alimentation: 0.1, energie_transport: 1, biens_importes: 0.08, services: 0.04 } as Record<Category, number>,
  /** Assiettes annuelles fictives (Md FCFA) de consommation par catégorie. */
  assiette: { alimentation: 3000, energie_transport: 1200, biens_importes: 1800, services: 2000 } as Record<Category, number>,
  /** Nombre fictif de ménages bénéficiaires potentiels par profil (milliers). */
  menages: { agriculteur: 900, famille: 1200, artisan: 300, commercant: 400, transporteur: 250 } as Record<ProfileId, number>,
  /** Catégorie principalement produite par chaque secteur (effet demande). */
  produit: { agriculture: "alimentation", commerce: "biens_importes", artisanat: "services", transport: "energie_transport", services: "services", numerique: "services" } as Record<SectorId, Category>,
};

export type PolicyInput = { kind: MeasureKind; value: number; target?: string; assumptions?: Partial<Assumptions> };

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export function normalizeInput(input: Partial<Omit<PolicyInput, "kind">> & { kind?: string }): PolicyInput {
  const def = MEASURES.find((m) => m.id === input.kind) ?? MEASURES[0];
  const raw = Number(input.value);
  const value = clamp(Number.isFinite(raw) ? raw : def.defaultValue, def.min, def.max);
  const assumptions = { ...DEFAULT_ASSUMPTIONS };
  for (const [k, v] of Object.entries(input.assumptions ?? {})) {
    const key = k as keyof Assumptions;
    if (key in ASSUMPTION_INFO && Number.isFinite(Number(v))) assumptions[key] = clamp(Number(v), ASSUMPTION_INFO[key].min, ASSUMPTION_INFO[key].max);
  }
  return { kind: def.id, value, target: input.target || def.defaultTarget, assumptions };
}

/** Étape 1 : variation de prix (%) par catégorie. */
export function priceEffects(p: PolicyInput, a: Assumptions): Record<Category, number> {
  const out: Record<Category, number> = { alimentation: 0, energie_transport: 0, biens_importes: 0, services: 0 };
  const targets = (p.target && p.target !== "toutes" ? p.target.split(",") : CATEGORIES.map((c) => c.id)) as Category[];
  for (const c of CATEGORIES.map((x) => x.id)) {
    if (p.kind === "tva" && targets.includes(c)) out[c] = p.value * a.repercussionTaxe * STRUCTURE.partFormelle[c];
    if (p.kind === "subvention" && targets.includes(c)) out[c] = -p.value * a.repercussionSubvention;
    if (p.kind === "droit_douane") out[c] = p.value * a.repercussionDouane * STRUCTURE.partImportee[c];
    if (p.kind === "carburant") out[c] = p.value * STRUCTURE.partTransport[c] * (c === "energie_transport" ? a.partCarburantEnergie : 1);
  }
  for (const c of Object.keys(out) as Category[]) out[c] = r2(out[c]);
  return out;
}

export function simulatePolicy(raw: Partial<Omit<PolicyInput, "kind">> & { kind?: string }) {
  const p = normalizeInput(raw);
  const a = p.assumptions as Assumptions;
  const measure = MEASURES.find((m) => m.id === p.kind)!;
  const dp = priceEffects(p, a);
  const transferTargets = p.kind === "transfert" ? ((p.target ?? "").split(",").filter((x) => PROFILES.some((pr) => pr.id === x)) as ProfileId[]) : [];

  // 2. Secteurs : coût des intrants (importés, carburant) + effet demande sur la catégorie produite + gains directs.
  const sectors = SECTORS.map((s) => {
    const costShock = s.importIntensity * dp.biens_importes + s.fuelIntensity * dp.energie_transport;
    const demandShock = dp[STRUCTURE.produit[s.id]];
    let output = -a.elasticiteDemande * (costShock + demandShock) / 2;
    if (p.kind === "droit_douane" && (s.id === "agriculture" || s.id === "artisanat")) output += p.value * a.protectionLocale;
    if (p.kind === "transfert") output += s.id === "agriculture" || s.id === "commerce" ? 0.2 * (transferTargets.length / PROFILES.length) * (p.value / 15000) : 0;
    return { id: s.id, name: s.name, costShock: r2(costShock), outputChange: r2(output), employmentChange: r2(output * a.elasticiteEmploi), informalShare: s.informalShare };
  });
  const sectorOut = new Map(sectors.map((s) => [s.id, s.outputChange]));

  // 3. Profils : coût de la vie (panier) et revenu.
  const profiles = PROFILES.map((pr) => {
    const costOfLiving = CATEGORIES.reduce((sum, c) => sum + pr.basket[c.id] * dp[c.id], 0);
    let income = (sectorOut.get(pr.incomeSector) ?? 0) * a.partRevenuSecteur;
    if (transferTargets.includes(pr.id)) income += (p.value / pr.monthlyIncome) * 100;
    const purchasingPower = income - costOfLiving;
    return { id: pr.id, label: pr.label, monthlyIncome: pr.monthlyIncome, costOfLiving: r2(costOfLiving), income: r2(income), purchasingPower: r2(purchasingPower), monthlyFcfa: Math.round((purchasingPower / 100) * pr.monthlyIncome) };
  });

  // 4. Régions : panier régional selon la structure fictive.
  const agriOut = sectorOut.get("agriculture") ?? 0;
  const otherOut = sectors.filter((s) => s.id !== "agriculture").reduce((s, x) => s + x.outputChange, 0) / (sectors.length - 1);
  const regions = REGIONS.map((rg) => {
    const w: Record<Category, number> = {
      alimentation: 0.4 + 0.15 * rg.agriShare,
      biens_importes: 0.12 + 0.15 * rg.importExposure,
      energie_transport: 0.14 + 0.08 * rg.remoteness,
      services: 0,
    };
    w.services = Math.max(0, 1 - w.alimentation - w.biens_importes - w.energie_transport);
    const remoteFactor = p.kind === "carburant" ? 0.75 + 0.5 * rg.remoteness : 1;
    const cost = CATEGORIES.reduce((s, c) => s + w[c.id] * dp[c.id], 0) * remoteFactor;
    let income = (rg.agriShare * agriOut + (1 - rg.agriShare) * otherOut) * a.partRevenuSecteur;
    if (p.kind === "transfert") {
      const coverage = transferTargets.reduce((s, t) => s + (t === "agriculteur" ? rg.agriShare : t === "famille" ? 0.35 : 0.1), 0);
      income += Math.min(1, coverage) * (p.value / 120000) * 100 * (rg.informalShare / 75);
    }
    return { id: rg.id, name: rg.name, popShare: rg.popShare, costOfLiving: r2(cost), income: r2(income), net: r2(income - cost) };
  });

  // 5. Budget (Md FCFA par an, + = recettes / économies, - = coût).
  let budget = 0;
  const targets = (p.target && p.target !== "toutes" ? p.target.split(",") : CATEGORIES.map((c) => c.id)) as Category[];
  if (p.kind === "tva") budget = targets.reduce((s, c) => s + ((p.value / 100) * STRUCTURE.assiette[c] * STRUCTURE.partFormelle[c] * (1 - (a.elasticiteDemande * dp[c]) / 100)), 0);
  if (p.kind === "subvention") budget = -targets.reduce((s, c) => s + (p.value / 100) * STRUCTURE.assiette[c] * 0.5, 0);
  if (p.kind === "droit_douane") budget = (p.value / 100) * CATEGORIES.reduce((s, c) => s + STRUCTURE.assiette[c.id] * STRUCTURE.partImportee[c.id] * 0.5, 0);
  if (p.kind === "carburant") budget = (p.value / 100) * STRUCTURE.assiette.energie_transport * a.partCarburantEnergie * 0.5;
  if (p.kind === "transfert") budget = -transferTargets.reduce((s, t) => s + (p.value * 12 * STRUCTURE.menages[t] * 1000) / 1e9, 0);

  const national = {
    costOfLiving: r2(regions.reduce((s, x) => s + x.popShare * x.costOfLiving, 0)),
    net: r2(regions.reduce((s, x) => s + x.popShare * x.net, 0)),
    employment: r2(sectors.reduce((s, x) => s + (SECTORS.find((y) => y.id === x.id)!.gdpShare * x.employmentChange), 0)),
  };

  // Effets non intentionnels repérés automatiquement.
  const warnings: string[] = [];
  const worstProfile = [...profiles].sort((x, y) => x.purchasingPower - y.purchasingPower)[0];
  const worstRegion = [...regions].sort((x, y) => x.net - y.net)[0];
  const poorest = [...profiles].sort((x, y) => x.monthlyIncome - y.monthlyIncome)[0];
  const richest = [...profiles].sort((x, y) => y.monthlyIncome - x.monthlyIncome)[0];
  if (worstProfile.purchasingPower < -0.2) warnings.push(`Profil le plus touché : ${worstProfile.label} (${worstProfile.purchasingPower} % de pouvoir d'achat, soit ${worstProfile.monthlyFcfa} FCFA/mois dans le profil type fictif).`);
  if (worstRegion.net < -0.2) warnings.push(`Région la plus touchée : ${worstRegion.name} (${worstRegion.net} %).`);
  if (poorest.purchasingPower < richest.purchasingPower - 0.3) warnings.push(`Effet régressif possible : le profil au revenu le plus bas (${poorest.label}) perd davantage que le plus élevé (${richest.label}).`);
  if (budget < -100) warnings.push(`Coût budgétaire élevé dans la démo (${Math.round(budget)} Md FCFA/an) : prévoir le financement.`);
  if (p.kind === "subvention") warnings.push(`Une partie de la subvention (${Math.round((1 - a.repercussionSubvention) * 100)} % dans l'hypothèse retenue) n'atteint pas le consommateur.`);
  if (sectors.some((s) => s.employmentChange < -0.5)) warnings.push(`Emploi en baisse dans : ${sectors.filter((s) => s.employmentChange < -0.5).map((s) => s.name).join(", ")} (secteurs à forte part informelle à surveiller).`);

  return {
    banner: DEMO_BANNER,
    notice: DEMO_NOTICE,
    isDemo: true as const,
    measure: { kind: p.kind, label: measure.label, value: p.value, valueLabel: measure.valueLabel, target: p.target ?? null },
    prices: CATEGORIES.map((c) => ({ id: c.id, label: c.label, change: dp[c.id] })),
    sectors,
    profiles,
    regions: regions.sort((x, y) => x.net - y.net),
    national,
    budget: { annualMdFcfa: Math.round(budget * 10) / 10, sens: budget >= 0 ? "recettes ou économies" : "coût pour l'État" },
    warnings,
    assumptions: (Object.keys(ASSUMPTION_INFO) as (keyof Assumptions)[]).map((k) => ({ id: k, ...ASSUMPTION_INFO[k], value: a[k], default: DEFAULT_ASSUMPTIONS[k], isExample: true })),
    structure: STRUCTURE,
    formulas: [
      "Prix (TVA) = Δ points × répercussion taxe × part formelle de la catégorie",
      "Prix (subvention) = − % subventionné × répercussion subvention",
      "Prix (douane) = Δ points × répercussion douane × part importée",
      "Prix (carburant) = Δ % × part transport de la catégorie (× poids du carburant pour « énergie & transport »)",
      "Activité secteur = − élasticité × (choc de coûts + choc de demande) / 2 (+ protection locale pour la douane)",
      "Emploi secteur = activité × élasticité de l'emploi",
      "Pouvoir d'achat profil = transmission × activité de son secteur (+ transfert / revenu type) − Σ panier × prix",
      "Région = revenu (part agricole × activité agricole + reste × activité moyenne) − panier régional × prix (× éloignement pour le carburant)",
      "Budget = taux × assiette fictive (coût des transferts = montant × 12 × ménages bénéficiaires)",
    ],
    limits: [
      "Modèle linéaire statique : pas d'effets de second tour, d'anticipations ni de réaction monétaire.",
      "Toutes les structures (paniers, assiettes, parts formelles, ménages) sont fictives : à remplacer par les données officielles.",
      "Le résultat sert à comparer des options et repérer des effets non intentionnels, pas à prévoir des chiffres.",
    ],
  };
}

export type PolicySimulation = ReturnType<typeof simulatePolicy>;

export function simulationMarkdown(sim: PolicySimulation) {
  return [
    `# Simulation — ${sim.measure.label} (${sim.measure.value} ${sim.measure.valueLabel}${sim.measure.target ? `, cible : ${sim.measure.target}` : ""})`,
    "",
    `> **${DEMO_BANNER}.** Modèle simple et transparent ; hypothèses et structures d'exemple.`,
    "",
    "## Prix par catégorie",
    ...sim.prices.map((x) => `- ${x.label} : ${x.change > 0 ? "+" : ""}${x.change} %`),
    "",
    "## Profils (pouvoir d'achat)",
    ...sim.profiles.map((x) => `- ${x.label} : ${x.purchasingPower > 0 ? "+" : ""}${x.purchasingPower} % (${x.monthlyFcfa} FCFA/mois, profil type fictif)`),
    "",
    "## Régions (effet net)",
    ...sim.regions.map((x) => `- ${x.name} : ${x.net > 0 ? "+" : ""}${x.net} %`),
    "",
    "## Secteurs",
    ...sim.sectors.map((x) => `- ${x.name} : activité ${x.outputChange} %, emploi ${x.employmentChange} %`),
    "",
    `## Budget : ${sim.budget.annualMdFcfa} Md FCFA/an (${sim.budget.sens})`,
    "",
    "## Effets non intentionnels repérés",
    ...(sim.warnings.length ? sim.warnings.map((w) => `- ${w}`) : ["- Aucun signal marquant avec ces hypothèses."]),
    "",
    "## Hypothèses (valeurs d'exemple)",
    ...sim.assumptions.map((h) => `- ${h.label} : ${h.value} — ${h.description}`),
    "",
    "## Formules",
    ...sim.formulas.map((f) => `- ${f}`),
    "",
    "## Limites",
    ...sim.limits.map((l) => `- ${l}`),
  ].join("\n");
}
