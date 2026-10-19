/**
 * Base des programmes de financement.
 *
 * - `verified: true` : programme RÉEL vérifié par recherche web le `verifiedAt` (pages officielles listées dans `sources`).
 *   Seuls les avantages et critères lus sur ces pages sont repris ; les critères relayés par une source secondaire
 *   sont marqués `confidence: "secondaire"` (un écart donne « à vérifier », jamais « non éligible »).
 *   Les dates limites changent chaque année : `lastKnownWindow` décrit la dernière fenêtre connue, à revérifier.
 * - `isExample: true` : programme SEED de démonstration, fictif, affiché avec le badge « Exemple ».
 */
export type CriterionKind =
  | "pays"
  | "age_min"
  | "anciennete_max"
  | "anciennete_min"
  | "numerique"
  | "prototype"
  | "immatriculee"
  | "chiffre_affaires"
  | "levee_max_usd"
  | "secteur_exclu"
  | "secteur_requis"
  | "equipe_min"
  | "manuel";

export type Criterion = {
  kind: CriterionKind;
  label: string;
  /** pays : liste de pays ou "Afrique" ; secteur_* : mots-clés ; seuils numériques sinon. */
  value?: number | string[];
  confidence: "officiel" | "secondaire";
};

export type ProgramType = "cloud" | "concours" | "accelerateur" | "subvention" | "pret" | "accompagnement" | "investisseur";

export type FundingProgram = {
  id: string;
  name: string;
  organization: string;
  type: ProgramType;
  summary: string;
  benefits: string[];
  criteria: Criterion[];
  documents: string[];
  cycle: "continu" | "annuel";
  lastKnownWindow?: string;
  applyUrl: string;
  sources: string[];
  contactEmail?: string;
  verified: boolean;
  verifiedAt?: string;
  isExample: boolean;
  caveat?: string;
};

export const VERIFIED_AT = "2026-10-19";

const AFRICA = ["Afrique"];

export const REAL_PROGRAMS: FundingProgram[] = [
  {
    id: "tef-entrepreneurship",
    name: "TEF Entrepreneurship Programme",
    organization: "Tony Elumelu Foundation",
    type: "subvention",
    summary: "Programme annuel panafricain : formation, mentorat et capital d'amorçage non remboursable pour les entrepreneurs des 54 pays africains.",
    benefits: ["US$5 000 de capital d'amorçage non remboursable (versé sur le compte bancaire de l'entreprise après le programme)", "Formation, mentorat et accès au réseau TEF"],
    criteria: [
      { kind: "pays", label: "Résider en Afrique et y créer l'entreprise", value: AFRICA, confidence: "officiel" },
      { kind: "age_min", label: "Avoir 18 ans ou plus", value: 18, confidence: "secondaire" },
      { kind: "anciennete_max", label: "Idée ou entreprise de 5 ans maximum", value: 5, confidence: "secondaire" },
      { kind: "manuel", label: "Ne pas avoir déjà bénéficié du programme", confidence: "secondaire" },
    ],
    documents: ["Pièce d'identité officielle avec date de naissance et photo", "Compte bancaire au nom de l'entreprise (versement du capital)", "Plan d'affaires certifié en fin de programme"],
    cycle: "annuel",
    lastKnownWindow: "Édition 2026 : candidatures du 1er janvier au 1er mars 2026 sur TEFConnect (close).",
    applyUrl: "https://www.tefconnect.com",
    sources: ["https://www.tonyelumelufoundation.org/press-releases/apply-tef-entrepreneurship-programme-2026", "https://www.tonyelumelufoundation.org/terms-conditions"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
    caveat: "Âge minimum et ancienneté maximale relayés par des sources secondaires : à confirmer sur TEFConnect.",
  },
  {
    id: "orange-poesam",
    name: "Prix Orange de l'Entrepreneur Social en Afrique et au Moyen-Orient (POESAM)",
    organization: "Orange Middle East and Africa",
    type: "concours",
    summary: "Concours annuel pour des projets intégrant les TIC avec un impact sociétal, avec prototype ou démonstration ; sélection nationale puis internationale.",
    benefits: ["Grand prix international : 25 000 €, 15 000 €, 10 000 € (1er à 3e)", "Prix féminin international : 20 000 €", "Accompagnement des finalistes (incubation via Orange Digital Center selon le pays)"],
    criteria: [
      { kind: "pays", label: "Projet visant un des 17 pays Orange éligibles (dont le Cameroun)", value: ["Cameroun", "Botswana", "Burkina Faso", "Côte d'Ivoire", "Égypte", "Guinée-Bissau", "Guinée", "Jordanie", "Liberia", "Madagascar", "Mali", "Maroc", "République centrafricaine", "RD Congo", "Sénégal", "Sierra Leone", "Tunisie"], confidence: "officiel" },
      { kind: "numerique", label: "Intégrer les technologies de l'information et de la communication", confidence: "officiel" },
      { kind: "prototype", label: "Prototype ou démonstration existant", confidence: "officiel" },
      { kind: "anciennete_max", label: "Start-up établie depuis moins de 5 ans", value: 5, confidence: "officiel" },
      { kind: "age_min", label: "Candidat de plus de 21 ans", value: 21, confidence: "officiel" },
    ],
    documents: ["Dossier de candidature en ligne sur poesam.orange.com", "Description du prototype ou de la démonstration", "Mesure de l'impact sociétal ou environnemental"],
    cycle: "annuel",
    lastKnownWindow: "Édition 2026 (16e) : date limite reportée au 17 mai 2026 (close).",
    applyUrl: "https://poesam.orange.com",
    sources: ["https://assets.orange.com/medias/domain12751/media101739/521985-vll1ohjvl2.pdf", "https://www.orange.com/fr/nos-actualites/jeunes-entrepreneurs-dafrique-et-moyen-orient-candidatez-au-poesam-2026", "https://poesam.orange.com/en"],
    contactEmail: "support.poesam@orange.com",
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
  {
    id: "africa-business-heroes",
    name: "Africa's Business Heroes (ABH)",
    organization: "Africa's Business Heroes",
    type: "concours",
    summary: "Concours annuel panafricain (anglais ou français) pour des entreprises formellement enregistrées, basées en Afrique, avec au moins trois ans d'activité.",
    benefits: ["Les 10 finalistes se partagent 1,5 million USD de subventions", "Formation, visibilité et accès à la communauté ABH"],
    criteria: [
      { kind: "pays", label: "Entreprise enregistrée et basée en Afrique", value: AFRICA, confidence: "officiel" },
      { kind: "immatriculee", label: "Entreprise formellement enregistrée", confidence: "officiel" },
      { kind: "anciennete_min", label: "Au moins 3 ans d'activité", value: 3, confidence: "officiel" },
    ],
    documents: ["Pièce d'identité officielle du fondateur", "Certificat d'immatriculation ou preuve de 3 ans d'activité (relevés bancaires, bail…)", "Vidéo du fondateur (1 min 30 maximum, anglais ou français)"],
    cycle: "annuel",
    lastKnownWindow: "Édition 2026 : date limite prolongée au 7 mai 2026 (close).",
    applyUrl: "https://africabusinessheroes.org/en/the-prize/overview",
    sources: ["https://africabusinessheroes.org/en/the-prize/overview", "https://africabusinessheroes.org/en/the-prize/application-guidelines"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
  {
    id: "google-accelerator-africa",
    name: "Google for Startups Accelerator: Africa",
    organization: "Google",
    type: "accelerateur",
    summary: "Accélérateur hybride de trois mois, sans prise de participation, pour des start-ups tech africaines en croissance utilisant l'IA.",
    benefits: ["Programme sans prise de participation (equity-free)", "Mentorat d'experts Google, ateliers techniques IA et cloud"],
    criteria: [
      { kind: "pays", label: "Start-up basée en Afrique", value: AFRICA, confidence: "officiel" },
      { kind: "numerique", label: "Start-up technologique (IA/ML dans le produit ou envisagée)", confidence: "officiel" },
      { kind: "chiffre_affaires", label: "Start-up en croissance générant du chiffre d'affaires", confidence: "officiel" },
    ],
    documents: ["Candidature en ligne (g.co/acceleratorafrica)", "Description des défis techniques prioritaires"],
    cycle: "annuel",
    lastKnownWindow: "Class 10 : candidatures jusqu'au 18 mars 2026, programme d'avril à juin 2026 (terminé).",
    applyUrl: "https://startup.google.com/programs/accelerator/africa/",
    sources: ["https://startup.google.com/programs/accelerator/africa/", "https://blog.google/intl/en-africa/company-news/outreach-and-initiatives/ai-first-founders-apply-now-for-the-10th-cohort-of-google-for-startups-accelerator-africa/"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
  {
    id: "google-cloud-start",
    name: "Google for Startups Cloud Program — niveau Start",
    organization: "Google Cloud",
    type: "cloud",
    summary: "Crédits Google Cloud pour start-ups technologiques ayant un MVP et un modèle d'affaires clair.",
    benefits: ["Jusqu'à 2 000 USD de crédits Google Cloud valables un an", "200 USD de crédits Google Skills"],
    criteria: [
      { kind: "numerique", label: "Start-up technologique avec un produit numérique", confidence: "officiel" },
      { kind: "prototype", label: "MVP fonctionnel", confidence: "officiel" },
      { kind: "anciennete_max", label: "Fondée il y a moins de 24 mois", value: 2, confidence: "officiel" },
      { kind: "manuel", label: "Pas encore de crédits Google Cloud (hors essai gratuit) ; pas une agence, un cabinet de conseil ni une entité publique", confidence: "officiel" },
    ],
    documents: ["Site web et domaine professionnel", "Feuille de route produit"],
    cycle: "continu",
    applyUrl: "https://cloud.google.com/startup",
    sources: ["https://cloud.google.com/startup/benefits"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
  {
    id: "microsoft-for-startups",
    name: "Microsoft for Startups",
    organization: "Microsoft",
    type: "cloud",
    summary: "Crédits Azure et accompagnement pour start-ups développant un produit logiciel ; crédits de départ dès l'approbation.",
    benefits: ["Crédits Azure de départ, jusqu'à 150 000 USD au fil de la progression vérifiée"],
    criteria: [
      { kind: "numerique", label: "Produit ou service logiciel détenu par l'entreprise", confidence: "officiel" },
      { kind: "manuel", label: "Siège dans un pays où les services Azure sont disponibles ; société privée à but lucratif ; pas de levée de série C ou ultérieure ; 350 000 USD de crédits Azure gratuits au maximum déjà reçus ; ni agence, ni cabinet de conseil, ni minage de cryptomonnaies", confidence: "officiel" },
    ],
    documents: ["Candidature sur startups.microsoft.com", "Compte Azure"],
    cycle: "continu",
    applyUrl: "https://startups.microsoft.com",
    sources: ["https://learn.microsoft.com/en-us/startups/microsoft-for-startups/overview"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
    caveat: "La disponibilité des services Azure pour une société basée au Cameroun est à vérifier lors de la candidature.",
  },
  {
    id: "aws-activate-founders",
    name: "AWS Activate — Founders (autofinancés)",
    organization: "Amazon Web Services",
    type: "cloud",
    summary: "Crédits AWS pour start-ups autofinancées ; niveau Portfolio (jusqu'à 200 000 USD) via un accélérateur ou investisseur partenaire.",
    benefits: ["1 000 USD de crédits au départ, jusqu'à 5 000 USD pour certains participants"],
    criteria: [
      { kind: "anciennete_max", label: "Fondée au cours des 10 dernières années", value: 10, confidence: "officiel" },
      { kind: "numerique", label: "Produit utilisant le cloud", confidence: "officiel" },
      { kind: "manuel", label: "Avant la série B ; compte AWS sur une offre payante ; nouveau aux crédits Activate", confidence: "officiel" },
    ],
    documents: ["AWS Builder ID", "Compte AWS lié", "Site web de l'entreprise"],
    cycle: "continu",
    applyUrl: "https://aws.amazon.com/startups/credits/",
    sources: ["https://aws.amazon.com/startups/credits/"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
  {
    id: "fne-cameroun",
    name: "Fonds National de l'Emploi — financement de projets",
    organization: "Fonds National de l'Emploi (FNE), Cameroun",
    type: "pret",
    summary: "Appui aux chercheurs d'emploi porteurs de projet : étude de faisabilité, formation, crédit et suivi (auto-emploi ou micro-entreprise). Services gratuits.",
    benefits: [
      "Auto-emploi : projet de 5 000 000 FCFA maximum, apport 20 %, crédit 3 ans maximum à 6 %",
      "Micro-entreprise (au moins deux emplois directs) : projet de 20 000 000 FCFA maximum, apport 20 %, crédit 5 ans maximum à 6 %",
    ],
    criteria: [
      { kind: "pays", label: "Projet au Cameroun", value: ["Cameroun"], confidence: "officiel" },
      { kind: "secteur_exclu", label: "Exclus : importation et vente directe de produits, activités de transport", value: ["transport", "livraison", "importation", "import", "moto-taxi", "taxi", "fret"], confidence: "officiel" },
      { kind: "manuel", label: "Être inscrit au FNE et passer un entretien d'orientation ; garanties (assurance vie, nantissement des équipements…)", confidence: "officiel" },
    ],
    documents: ["Inscription dans une agence FNE", "Étude de pré-faisabilité", "Apport personnel de 20 %", "Garanties : assurance vie du promoteur, nantissement des équipements, caution morale ou hypothèque selon le cas"],
    cycle: "continu",
    applyUrl: "https://www.fnecm.org/index.php/fr/mesures-d-appui-100210/projets",
    sources: ["https://www.fnecm.org/index.php/fr/mesures-d-appui-100210/projets"],
    contactEmail: "contact@fnecm.org",
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
  {
    id: "apme-cameroun",
    name: "Agence de Promotion des PME (APME) — accompagnement et incubation",
    organization: "APME, sous tutelle du MINPMEESA",
    type: "accompagnement",
    summary: "Établissement public : facilitation des formalités de création, assistance aux porteurs de projets, renforcement des compétences, incubation de start-up.",
    benefits: ["Accompagnement à la création et aux formalités", "Incubation de start-up et conseil (pas de montant de financement publié)"],
    criteria: [{ kind: "pays", label: "Porteur de projet ou PME au Cameroun", value: ["Cameroun"], confidence: "officiel" }],
    documents: ["Description du projet", "Pièces d'identité des promoteurs"],
    cycle: "continu",
    applyUrl: "https://apme.cm",
    sources: ["https://www.minpmeesa.cm/site/ministere/structures-sous-tutelle/lagence-de-promotion-des-pme-apme/"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
  {
    id: "y-combinator",
    name: "Y Combinator",
    organization: "Y Combinator",
    type: "investisseur",
    summary: "Accélérateur international ; accord standard identique pour chaque start-up acceptée, sans frais.",
    benefits: ["Investissement standard de 500 000 USD : 125 000 USD pour 7 % (SAFE post-money) + 375 000 USD en SAFE MFN non plafonné"],
    criteria: [
      { kind: "numerique", label: "Start-up à fort potentiel de croissance (majoritairement tech)", confidence: "secondaire" },
      { kind: "manuel", label: "YC investit dans des sociétés américaines, canadiennes, caïmanaises ou singapouriennes : une société camerounaise doit créer une société mère (« flip »)", confidence: "officiel" },
    ],
    documents: ["Candidature en ligne", "Vidéo des fondateurs", "Démo du produit"],
    cycle: "continu",
    lastKnownWindow: "Plusieurs sessions par an ; la session Été 2026 était close le 4 mai 2026.",
    applyUrl: "https://www.ycombinator.com/apply",
    sources: ["https://www.ycombinator.com/deal/", "https://www.ycombinator.com/apply"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
  {
    id: "mest-africa-challenge",
    name: "MEST Africa Challenge (MAC)",
    organization: "MEST Africa",
    type: "concours",
    summary: "Compétition de pitch panafricaine pour start-ups tech en phase d'amorçage ; l'édition 2025 ciblait la fintech sur les marchés prioritaires d'Absa.",
    benefits: ["Prix : 50 000 USD en participation (equity) et entrée au portefeuille MEST"],
    criteria: [
      { kind: "pays", label: "Opérer sur un marché ciblé (édition 2025 : Botswana, Ouganda, Maurice, Seychelles, Kenya, Mozambique, Zambie, Ghana)", value: ["Botswana", "Ouganda", "Maurice", "Seychelles", "Kenya", "Mozambique", "Zambie", "Ghana"], confidence: "officiel" },
      { kind: "secteur_requis", label: "Fintech, insurtech ou chaînes de valeur proches", value: ["fintech", "paiement", "paiements", "assurance", "credit", "mobile money", "finance"], confidence: "officiel" },
      { kind: "anciennete_max", label: "3 ans d'existence maximum", value: 3, confidence: "officiel" },
      { kind: "levee_max_usd", label: "1 million USD levé au maximum", value: 1_000_000, confidence: "officiel" },
      { kind: "equipe_min", label: "Au moins 2 membres fondateurs", value: 2, confidence: "officiel" },
      { kind: "chiffre_affaires", label: "Revenu récurrent mensuel d'au moins 5 000 USD depuis 6 mois", confidence: "officiel" },
    ],
    documents: ["Candidature en ligne", "Vidéo pitch de 3 minutes (en anglais)", "Pitch deck"],
    cycle: "annuel",
    lastKnownWindow: "Critères de l'édition 2025 (page officielle) ; ceux de l'édition 2026 sont à vérifier.",
    applyUrl: "https://meltwater.org/mac/",
    sources: ["https://meltwater.org/mac/"],
    verified: true,
    verifiedAt: VERIFIED_AT,
    isExample: false,
  },
];

/** Programmes fictifs pour la démonstration : jamais présentés comme réels. */
export const EXAMPLE_PROGRAMS: FundingProgram[] = [
  {
    id: "ex-amorcage-numerique",
    name: "Fonds d'amorçage numérique du Littoral (exemple)",
    organization: "Organisme fictif (exemple)",
    type: "subvention",
    summary: "EXEMPLE fictif : subvention d'amorçage pour start-ups numériques de la région du Littoral.",
    benefits: ["Montant : exemple, non réel"],
    criteria: [
      { kind: "pays", label: "Projet au Cameroun", value: ["Cameroun"], confidence: "officiel" },
      { kind: "numerique", label: "Projet numérique", confidence: "officiel" },
      { kind: "anciennete_max", label: "Moins de 3 ans", value: 3, confidence: "officiel" },
    ],
    documents: ["Plan d'affaires", "Statuts", "Budget prévisionnel"],
    cycle: "annuel",
    applyUrl: "https://example.com/amorcage",
    sources: [],
    contactEmail: "candidatures@fonds-littoral.example.com",
    verified: false,
    isExample: true,
  },
  {
    id: "ex-pret-honneur",
    name: "Prêt d'honneur jeunes entrepreneurs (exemple)",
    organization: "Réseau fictif (exemple)",
    type: "pret",
    summary: "EXEMPLE fictif : prêt personnel à taux zéro pour fondateurs de moins de 35 ans.",
    benefits: ["Montant : exemple, non réel"],
    criteria: [
      { kind: "pays", label: "Afrique centrale", value: ["Cameroun", "Gabon", "Congo", "Tchad", "République centrafricaine", "Guinée équatoriale"], confidence: "officiel" },
      { kind: "manuel", label: "Fondateur de moins de 35 ans", confidence: "officiel" },
    ],
    documents: ["Plan d'affaires", "CV du fondateur"],
    cycle: "continu",
    applyUrl: "https://example.com/pret-honneur",
    sources: [],
    contactEmail: "pret@reseau-honneur.example.com",
    verified: false,
    isExample: true,
  },
  {
    id: "ex-angels-diaspora",
    name: "Réseau de business angels de la diaspora (exemple)",
    organization: "Réseau fictif (exemple)",
    type: "investisseur",
    summary: "EXEMPLE fictif : investisseurs individuels de la diaspora, tickets d'amorçage contre participation.",
    benefits: ["Ticket : exemple, non réel"],
    criteria: [
      { kind: "immatriculee", label: "Société immatriculée", confidence: "officiel" },
      { kind: "chiffre_affaires", label: "Premiers revenus", confidence: "officiel" },
    ],
    documents: ["Pitch deck", "Table de capitalisation", "États financiers"],
    cycle: "continu",
    applyUrl: "https://example.com/angels",
    sources: [],
    contactEmail: "dealflow@angels-diaspora.example.com",
    verified: false,
    isExample: true,
  },
  {
    id: "ex-concours-logistique",
    name: "Concours innovation logistique urbaine (exemple)",
    organization: "Organisateur fictif (exemple)",
    type: "concours",
    summary: "EXEMPLE fictif : prix pour les solutions de livraison du dernier kilomètre.",
    benefits: ["Prix : exemple, non réel"],
    criteria: [
      { kind: "secteur_requis", label: "Logistique, transport ou livraison", value: ["logistique", "livraison", "transport", "colis"], confidence: "officiel" },
      { kind: "prototype", label: "Service opérationnel ou pilote", confidence: "officiel" },
    ],
    documents: ["Présentation du service", "Indicateurs de pilote"],
    cycle: "annuel",
    applyUrl: "https://example.com/concours-logistique",
    sources: [],
    contactEmail: "jury@concours-logistique.example.com",
    verified: false,
    isExample: true,
  },
];

export const ALL_PROGRAMS: FundingProgram[] = [...REAL_PROGRAMS, ...EXAMPLE_PROGRAMS];

export function getProgram(id: string) {
  return ALL_PROGRAMS.find((p) => p.id === id);
}
