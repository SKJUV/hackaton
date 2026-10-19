import { structureTable } from "./structure";
import type { BudgetLine, Counterparty, Dataset, EntrepriseStore, FinanceSettings } from "./types";

/**
 * SEED DE DÉMONSTRATION du module entreprise — toutes les données sont FICTIVES (« exemple »).
 * Elles servent à montrer les tableaux de bord, anomalies, trésorerie et due diligence tant que
 * l'entreprise n'a pas importé ses propres fichiers. Aucun chiffre n'est présenté comme réel.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const day = (base: Date, offset: number) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const monthStart = (base: Date, offset: number) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
const round = (n: number, step = 500) => Math.round(n / step) * step;

type Table = { headers: string[]; rows: string[][] };

function kmerlogTables(now: Date): Record<"ventes" | "finances" | "rh" | "clients", Table> {
  const r = rng(42);
  const clients = ["Boutique Akwa Mode (exemple)", "Bonapriso Électro (exemple)", "Saveurs du Wouri (exemple)", "PharmaDeido (exemple)", "Kmer Cosmétiques (exemple)", "Librairie Bali (exemple)", "TechMarket Douala (exemple)", "Ndokoti Shop (exemple)"];
  const produits = [
    { p: "Livraison express J+0", prix: 2500 },
    { p: "Livraison standard J+1", prix: 1500 },
    { p: "Encaissement à la livraison", prix: 500 },
  ];
  const ventes: string[][] = [];
  for (let i = -180; i <= -1; i++) {
    const n = 2 + Math.floor(r() * 3);
    const growth = 1 + (180 + i) / 400;
    for (let k = 0; k < n; k++) {
      const c = clients[Math.floor(r() ** 1.6 * clients.length)];
      const pr = produits[Math.floor(r() * produits.length)];
      const q = Math.max(1, Math.round((8 + r() * 14) * growth));
      ventes.push([day(now, i), c, pr.p, String(q), String(q * pr.prix)]);
    }
  }
  // Anomalies volontaires (exemple) : pic, doublon, montant négatif.
  ventes.push([day(now, -12), "TechMarket Douala (exemple)", "Livraison express J+0", "420", String(420 * 2500)]);
  ventes.push([...ventes[ventes.length - 30]]);
  ventes.push([day(now, -4), "Ndokoti Shop (exemple)", "Livraison standard J+1", "3", "-4500"]);

  const finances: string[][] = [];
  const charges: [string, number][] = [["Salaires", 1450000], ["Carburant", 620000], ["Loyer", 250000], ["Maintenance motos", 210000], ["Marketing", 180000], ["Assurance", 95000], ["Logiciels", 60000]];
  for (let m = -6; m <= -1; m++) {
    const ms = monthStart(now, m);
    const monthVentes = ventes.filter((v) => v[0].startsWith(ms.toISOString().slice(0, 7))).reduce((s, v) => s + Number(v[4]), 0);
    finances.push([day(ms, 27), "Encaissements clients", "Recette", String(round(monthVentes * 0.93))]);
    for (const [cat, base] of charges) {
      let amount = base * (0.92 + r() * 0.16);
      if (cat === "Marketing" && m === -2) amount = base * 4.2; // campagne exceptionnelle (exemple)
      if (cat === "Carburant") amount *= 1 + (m + 6) * 0.03;
      finances.push([day(ms, cat === "Salaires" ? 26 : 5 + Math.floor(r() * 18)), cat, "Dépense", String(round(amount))]);
    }
  }
  const rh: string[][] = [
    ["Gérant (exemple)", "Direction", "Gérant", "450000", day(now, -400), ""],
    ["Awa Mbarga (exemple)", "Opérations", "Responsable opérations", "320000", day(now, -300), ""],
    ["Paul Etoa (exemple)", "Technique", "Développeur", "300000", day(now, -250), ""],
    ["Coursier 1 (exemple)", "Livraison", "Coursier", "95000", day(now, -200), ""],
    ["Coursier 2 (exemple)", "Livraison", "Coursier", "95000", day(now, -190), ""],
    ["Coursier 3 (exemple)", "Livraison", "Coursier", "95000", day(now, -120), day(now, -20)],
    ["Coursier 4 (exemple)", "Livraison", "Coursier", "98000", day(now, -90), ""],
    ["Coursier 5 (exemple)", "Livraison", "Coursier", "390000", day(now, -30), ""],
  ];
  const clientsRows: string[][] = clients.map((c, i) => {
    const encours = i === 0 ? 2350000 : i === 3 ? 640000 : round(50000 + r() * 300000);
    const retard = i === 3 ? 124 : i === 6 ? 67 : Math.floor(r() * 25);
    return [c, i < 3 ? "Grand compte" : "PME", "Douala", String(encours), String(retard), day(now, 30 - retard)];
  });
  return {
    ventes: { headers: ["Date", "Client", "Produit", "Quantité", "Montant"], rows: ventes },
    finances: { headers: ["Date", "Catégorie", "Type", "Montant"], rows: finances },
    rh: { headers: ["Nom", "Département", "Poste", "Salaire brut", "Date d'entrée", "Date de sortie"], rows: rh },
    clients: { headers: ["Client", "Segment", "Ville", "Encours", "Jours de retard", "Échéance"], rows: clientsRows },
  };
}

function afritelTables(now: Date): Partial<Record<"finances" | "rh", Table>> {
  const r = rng(7);
  const finances: string[][] = [];
  for (let m = -4; m <= -1; m++) {
    const ms = monthStart(now, m);
    if (m === -4) finances.push([day(ms, 3), "Apport des associés", "Recette", "20000000"]);
    for (const [cat, base] of [["Études techniques", 900000], ["Salaires", 750000], ["Conseil juridique", 300000], ["Loyer", 200000], ["Équipements réseau", m === -1 ? 3800000 : 400000]] as [string, number][])
      finances.push([day(ms, 4 + Math.floor(r() * 20)), cat, "Dépense", String(round(base * (0.9 + r() * 0.2)))]);
  }
  return {
    finances: { headers: ["Date", "Catégorie", "Type", "Montant"], rows: finances },
    rh: {
      headers: ["Nom", "Département", "Poste", "Salaire brut", "Date d'entrée", "Date de sortie"],
      rows: [
        ["Président (exemple)", "Direction", "Président", "400000", day(now, -120), ""],
        ["Ingénieur radio (exemple)", "Technique", "Ingénieur réseau", "350000", day(now, -100), ""],
      ],
    },
  };
}

const NAMES: Record<string, string> = { ventes: "Ventes (exemple)", finances: "Journal de trésorerie (exemple)", rh: "Registre du personnel (exemple)", clients: "Portefeuille clients (exemple)" };

export function seedDatasets(companyId: string, now = new Date()): Dataset[] {
  const tables = companyId === "co_kmerlog" ? kmerlogTables(now) : companyId === "co_afritel" ? afritelTables(now) : kmerlogTables(now);
  return Object.entries(tables).map(([domain, table]) =>
    structureTable(table as Table, {
      companyId,
      id: `ds_seed_${companyId}_${domain}`,
      name: NAMES[domain],
      fileName: `${domain}-exemple.csv`,
      kind: "seed",
      domain: domain as Dataset["domain"],
      isExample: true,
      now: now.toISOString(),
    }),
  );
}

export function seedBudgets(companyId: string): BudgetLine[] {
  const lines: [string, number][] =
    companyId === "co_afritel"
      ? [["Études techniques", 1000000], ["Salaires", 800000], ["Conseil juridique", 250000], ["Loyer", 200000], ["Équipements réseau", 1500000]]
      : [["Salaires", 1500000], ["Carburant", 650000], ["Loyer", 250000], ["Maintenance motos", 200000], ["Marketing", 250000], ["Assurance", 100000], ["Logiciels", 60000]];
  return lines.map(([category, monthly], i) => ({ id: `bud_${companyId}_${i}`, companyId, category, monthly, isExample: true }));
}

export function seedSettings(companyId: string, now = new Date()): FinanceSettings {
  const afritel = companyId === "co_afritel";
  return {
    companyId,
    openingCash: afritel ? 1500000 : 9000000,
    openingDate: monthStart(now, afritel ? -4 : -6).toISOString().slice(0, 10),
    safetyCash: afritel ? 3000000 : 2500000,
    fxShare: afritel ? 0.6 : 0.25,
    currency: "XAF",
    isExample: true,
  };
}

export function seedCounterparties(companyId: string): Counterparty[] {
  const base: Omit<Counterparty, "id" | "companyId">[] = [
    { name: "Boutique Akwa Mode (exemple)", kind: "client", country: "Cameroun", city: "Douala", registration: "RC/DLA/EXEMPLE/001", yearsActive: 6, notes: ["Client historique, volumes en hausse"], isExample: true },
    { name: "PharmaDeido (exemple)", kind: "client", country: "Cameroun", city: "Douala", yearsActive: 2, notes: ["Deux factures contestées au trimestre précédent"], isExample: true },
    { name: "Douala Moto Distribution (exemple)", kind: "fournisseur", country: "Cameroun", city: "Douala", registration: "RC/DLA/EXEMPLE/013", yearsActive: 9, notes: ["Délais de livraison respectés sur 3 commandes"], isExample: true },
    { name: "Import Pièces Asia (exemple)", kind: "fournisseur", country: "Chine", yearsActive: 1, notes: ["Paiement exigé à 100 % à la commande", "Facturation en USD"], isExample: true },
    { name: "PayKmer Mobile Money (exemple)", kind: "partenaire", country: "Cameroun", city: "Yaoundé", yearsActive: 4, notes: ["Intégration API d'encaissement prévue"], isExample: true },
    { name: "Wouri Angels (exemple)", kind: "investisseur", country: "Cameroun", city: "Douala", yearsActive: 3, notes: ["Ticket moyen annoncé : à confirmer", "Demande un siège au conseil"], publicFinancials: { year: 2025, source: "Déclaration de l'investisseur (exemple)" }, isExample: true },
    { name: "Diaspora Capital Fund (exemple)", kind: "investisseur", country: "France", yearsActive: 0, notes: ["Structure créée récemment, pas de référence vérifiable"], isExample: true },
  ];
  return base.map((c, i) => ({ ...c, id: `cp_${companyId}_${i}`, companyId }));
}

/** Seed complet pour une entreprise de démonstration. */
export function seedStore(companyId: string, now = new Date()): EntrepriseStore {
  return { datasets: seedDatasets(companyId, now), budgets: seedBudgets(companyId), settings: [seedSettings(companyId, now)], counterparties: seedCounterparties(companyId), reports: [] };
}

/** Signaux de marché d'EXEMPLE (veille sectorielle) — à remplacer par des flux réels. */
export const MARKET_SIGNALS_EXAMPLE = [
  { id: "sig1", title: "Hausse du prix du carburant à la pompe (exemple)", tags: ["livraison", "transport", "colis", "logistique"], impact: "Coût de livraison par course en hausse", kind: "matieres_premieres" },
  { id: "sig2", title: "Un nouvel acteur de livraison lève des fonds à Douala (exemple)", tags: ["livraison", "colis", "commerce électronique"], impact: "Pression concurrentielle sur les prix", kind: "concurrence" },
  { id: "sig3", title: "Croissance des paiements mobile money chez les e-commerçants (exemple)", tags: ["commerce électronique", "paiement", "colis"], impact: "Opportunité : encaissement à la livraison", kind: "consommation" },
  { id: "sig4", title: "Pénurie d'équipements radio chez les importateurs (exemple)", tags: ["internet", "télécommunications", "fréquences"], impact: "Délais d'approvisionnement allongés", kind: "matieres_premieres" },
  { id: "sig5", title: "Offres d'accès satellitaire grand public en test (exemple)", tags: ["internet", "communications électroniques"], impact: "Signal faible de disruption pour les FAI terrestres", kind: "disruption" },
];

/** Appels d'offres d'EXEMPLE (fictifs) — complétés par des sources réelles quand elles répondent. */
export const TENDERS_EXAMPLE = [
  { id: "ao_ex1", title: "Prestations de courses et de distribution de plis administratifs (exemple)", buyer: "Commune fictive de Douala Ve (exemple)", tags: ["courrier", "colis", "livraison", "postal"], deadlineDays: 21, amount: 18000000 },
  { id: "ao_ex2", title: "Fourniture et installation d'une liaison Internet haut débit (exemple)", buyer: "Établissement public fictif (exemple)", tags: ["internet", "communications électroniques", "télécommunications"], deadlineDays: 30, amount: 45000000 },
  { id: "ao_ex3", title: "Plateforme de commerce électronique pour artisans (exemple)", buyer: "Programme fictif d'appui aux PME (exemple)", tags: ["commerce électronique", "paiement"], deadlineDays: 14, amount: 25000000 },
];
