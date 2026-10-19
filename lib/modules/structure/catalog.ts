/**
 * Catalogue des formes d'entreprise courantes au Cameroun (espace OHADA).
 *
 * ⚠️ Le corpus officiel indexé ne contient PAS l'Acte uniforme OHADA sur les sociétés commerciales :
 * les caractéristiques ci-dessous sont des REPÈRES GÉNÉRAUX À CONFIRMER (non couverts par le corpus),
 * jamais présentés comme du texte de loi. Les coûts et délais sont des EXEMPLES indicatifs.
 * Chaque affichage est accompagné d'une recherche dans le corpus (`groundQuery`) qui dit ce qui est réellement couvert.
 */
export type FormId = "EI" | "SARL" | "SARLU" | "SAS" | "SASU" | "SA" | "GIE" | "SNC";

export type LegalFormInfo = {
  id: FormId;
  name: string;
  founders: { min: number; max?: number };
  liability: "illimitee" | "limitee";
  /** Repère général, non couvert par le corpus : à confirmer. */
  capitalRepere: string;
  governance: string;
  shareTransfer: string;
  investorFriendly: number; // 0–3
  flexibility: number; // 0–3
  simplicity: number; // 0–3
  needsCapitalDeposit: boolean;
  goodFor: string[];
  cautions: string[];
  /** EXEMPLE indicatif (FCFA) : frais de création tout compris, à remplacer par un devis réel. */
  exampleCostFcfa: [number, number];
  /** EXEMPLE indicatif (jours ouvrés). */
  exampleDelayDays: [number, number];
  legalQuery: string;
};

export const CATALOG_NOTICE =
  "Repères généraux sur les formes OHADA, non couverts par le corpus officiel actuel (l'Acte uniforme OHADA n'est pas indexé) : à confirmer auprès d'un notaire, d'un avocat ou du guichet de création. Coûts et délais : exemples indicatifs.";

export const LEGAL_FORMS: LegalFormInfo[] = [
  {
    id: "EI", name: "Entreprise individuelle (établissement)", founders: { min: 1, max: 1 }, liability: "illimitee",
    capitalRepere: "Pas de capital social, patrimoine personnel engagé — à confirmer.", governance: "L'entrepreneur décide seul.",
    shareTransfer: "Pas de parts : cession du fonds de commerce.", investorFriendly: 0, flexibility: 1, simplicity: 3, needsCapitalDeposit: false,
    goodFor: ["tester une activité seul", "petit budget de démarrage"], cautions: ["responsabilité illimitée sur les biens personnels", "impossible de faire entrer un associé ou un investisseur"],
    exampleCostFcfa: [20_000, 60_000], exampleDelayDays: [1, 5], legalQuery: "entreprise individuelle commerçant immatriculation registre du commerce",
  },
  {
    id: "SARL", name: "Société à responsabilité limitée", founders: { min: 2 }, liability: "limitee",
    capitalRepere: "Capital minimum fixé par l'acte uniforme OHADA (souvent cité : 100 000 FCFA) — à confirmer.", governance: "Un ou plusieurs gérants ; décisions collectives des associés.",
    shareTransfer: "Cession à des tiers généralement soumise à agrément des associés.", investorFriendly: 1, flexibility: 1, simplicity: 2, needsCapitalDeposit: true,
    goodFor: ["PME familiale ou entre associés", "cadre connu des banques"], cautions: ["entrée d'investisseurs moins souple", "règles de majorité encadrées"],
    exampleCostFcfa: [150_000, 450_000], exampleDelayDays: [3, 15], legalQuery: "société à responsabilité limitée gérant parts sociales capital",
  },
  {
    id: "SARLU", name: "SARL unipersonnelle", founders: { min: 1, max: 1 }, liability: "limitee",
    capitalRepere: "Mêmes repères que la SARL (associé unique) — à confirmer.", governance: "L'associé unique, souvent gérant.",
    shareTransfer: "Libre pour l'associé unique ; devient une SARL à plusieurs.", investorFriendly: 1, flexibility: 1, simplicity: 2, needsCapitalDeposit: true,
    goodFor: ["fondateur seul qui veut protéger son patrimoine"], cautions: ["évolution vers SARL à prévoir si des associés arrivent"],
    exampleCostFcfa: [150_000, 400_000], exampleDelayDays: [3, 15], legalQuery: "société unipersonnelle associé unique parts sociales",
  },
  {
    id: "SAS", name: "Société par actions simplifiée", founders: { min: 2 }, liability: "limitee",
    capitalRepere: "Capital librement fixé par les statuts (repère OHADA courant) — à confirmer.", governance: "Président obligatoire ; organisation librement définie par les statuts.",
    shareTransfer: "Clauses d'agrément, de préemption et d'inaliénabilité possibles dans les statuts.", investorFriendly: 3, flexibility: 3, simplicity: 1, needsCapitalDeposit: true,
    goodFor: ["startup qui prévoit des levées de fonds", "pacte d'associés avec vesting"], cautions: ["statuts à rédiger avec soin (tout y est libre)"],
    exampleCostFcfa: [250_000, 700_000], exampleDelayDays: [5, 20], legalQuery: "société par actions simplifiée président actions statuts",
  },
  {
    id: "SASU", name: "SAS unipersonnelle", founders: { min: 1, max: 1 }, liability: "limitee",
    capitalRepere: "Comme la SAS (associé unique) — à confirmer.", governance: "Président = associé unique ou tiers.",
    shareTransfer: "Libre ; bascule en SAS à l'entrée d'associés.", investorFriendly: 3, flexibility: 3, simplicity: 1, needsCapitalDeposit: true,
    goodFor: ["fondateur seul qui veut lever des fonds plus tard"], cautions: ["coût de rédaction des statuts"],
    exampleCostFcfa: [250_000, 650_000], exampleDelayDays: [5, 20], legalQuery: "société par actions simplifiée unipersonnelle associé unique président",
  },
  {
    id: "SA", name: "Société anonyme", founders: { min: 1 }, liability: "limitee",
    capitalRepere: "Capital minimum élevé (souvent cité : 10 000 000 FCFA) et commissaire aux comptes — à confirmer.", governance: "Conseil d'administration ou administrateur général ; assemblées.",
    shareTransfer: "Actions négociables ; clauses d'agrément possibles.", investorFriendly: 2, flexibility: 0, simplicity: 0, needsCapitalDeposit: true,
    goodFor: ["grands projets", "activités réglementées exigeant cette forme"], cautions: ["formalisme et coûts de fonctionnement élevés"],
    exampleCostFcfa: [1_000_000, 3_000_000], exampleDelayDays: [15, 45], legalQuery: "société anonyme conseil d'administration capital social commissaire aux comptes",
  },
  {
    id: "GIE", name: "Groupement d'intérêt économique", founders: { min: 2 }, liability: "illimitee",
    capitalRepere: "Peut être constitué sans capital — à confirmer.", governance: "Assemblée des membres ; un ou plusieurs administrateurs.",
    shareTransfer: "Entrée et sortie des membres selon le contrat.", investorFriendly: 0, flexibility: 2, simplicity: 2, needsCapitalDeposit: false,
    goodFor: ["mutualiser des moyens entre entreprises existantes"], cautions: ["n'a pas pour but premier de réaliser des bénéfices pour lui-même", "membres responsables des dettes"],
    exampleCostFcfa: [100_000, 300_000], exampleDelayDays: [5, 20], legalQuery: "groupement d'intérêt économique membres",
  },
  {
    id: "SNC", name: "Société en nom collectif", founders: { min: 2 }, liability: "illimitee",
    capitalRepere: "Pas de minimum courant — à confirmer.", governance: "Gérant(s) ; décisions souvent à l'unanimité.",
    shareTransfer: "Cession soumise au consentement de tous les associés.", investorFriendly: 0, flexibility: 1, simplicity: 2, needsCapitalDeposit: false,
    goodFor: ["associés de confiance, activité familiale"], cautions: ["responsabilité illimitée et solidaire des associés"],
    exampleCostFcfa: [120_000, 350_000], exampleDelayDays: [5, 15], legalQuery: "société en nom collectif associés solidairement",
  },
];

export const FORM_MAP = new Map(LEGAL_FORMS.map((f) => [f.id, f]));
export const isFormId = (v: unknown): v is FormId => typeof v === "string" && FORM_MAP.has(v as FormId);
