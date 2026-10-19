/**
 * Modèle de données du module « entreprise » (niveau 2 — Intelligence d'entreprise).
 * Stocké dans le champ optionnel `entreprise` du store JSON du workspace.
 * Toute donnée `isExample: true` est un seed de démonstration (fictif, non officiel).
 */

export type DatasetDomain = "ventes" | "finances" | "rh" | "clients";

/** Champs canoniques reconnus à la structuration. */
export type CanonicalField =
  | "date"
  | "montant"
  | "categorie"
  | "sens"
  | "client"
  | "produit"
  | "quantite"
  | "employe"
  | "departement"
  | "poste"
  | "salaire"
  | "date_entree"
  | "date_sortie"
  | "encours"
  | "echeance"
  | "jours_retard"
  | "segment"
  | "ville"
  | "devise";

/** Ligne structurée : valeurs canoniques + colonnes d'origine. */
export type DataRow = {
  date?: string;
  montant?: number;
  categorie?: string;
  client?: string;
  produit?: string;
  quantite?: number;
  employe?: string;
  departement?: string;
  poste?: string;
  salaire?: number;
  date_entree?: string;
  date_sortie?: string;
  encours?: number;
  echeance?: string;
  jours_retard?: number;
  segment?: string;
  ville?: string;
  devise?: string;
  raw: Record<string, string>;
};

export type Dataset = {
  id: string;
  companyId: string;
  name: string;
  domain: DatasetDomain;
  source: { kind: "csv" | "xlsx" | "seed"; fileName: string; sheet?: string };
  /** Correspondance colonne d'origine → champ canonique. */
  mapping: Record<string, CanonicalField>;
  headers: string[];
  rows: DataRow[];
  warnings: string[];
  importedAt: string;
  isExample: boolean;
};

export type BudgetLine = { id: string; companyId: string; category: string; monthly: number; isExample: boolean };

export type FinanceSettings = {
  companyId: string;
  openingCash: number;
  openingDate: string;
  /** Seuil d'alerte de trésorerie (montant minimum souhaité). */
  safetyCash: number;
  /** Part des achats libellés en devise étrangère (0–1), pour le risque de change. */
  fxShare: number;
  currency: string;
  isExample: boolean;
};

export type CounterpartyKind = "partenaire" | "fournisseur" | "client" | "investisseur";

export type Counterparty = {
  id: string;
  companyId: string;
  name: string;
  kind: CounterpartyKind;
  country: string;
  city?: string;
  registration?: string;
  yearsActive?: number;
  /** Signaux déclarés ou issus des données (retards, litiges, presse…). */
  notes: string[];
  publicFinancials?: { year: number; revenue?: number; result?: number; source: string };
  isExample: boolean;
};

export type WeeklyReport = {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  title: string;
  markdown: string;
  documentId?: string;
  trigger: "manuel" | "agent" | "routine";
  createdAt: string;
};

export type EntrepriseStore = {
  datasets: Dataset[];
  budgets: BudgetLine[];
  settings: FinanceSettings[];
  counterparties: Counterparty[];
  reports: WeeklyReport[];
};

export type Severity = "info" | "attention" | "critique";

export type Anomaly = {
  id: string;
  datasetId: string;
  domain: DatasetDomain;
  severity: Severity;
  kind: "pic" | "chute" | "valeur_aberrante" | "doublon" | "valeur_negative" | "donnee_manquante" | "date_future" | "retard_paiement" | "concentration" | "depassement_budget";
  title: string;
  detail: string;
  period?: string;
};
