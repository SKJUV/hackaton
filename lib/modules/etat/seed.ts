/**
 * Module « État » (niveau 3) — DONNÉES DE DÉMONSTRATION.
 *
 * TOUT ce fichier est FICTIF : séries, régions chiffrées, seuils, programmes d'aide et actualités sont
 * inventés pour la démo et ne décrivent aucune statistique officielle. Les noms de régions servent seulement
 * de libellés géographiques ; les valeurs associées sont fictives. Aucun chiffre du dossier investisseur
 * n'est repris ici. La seule donnée réelle possible vient de la couche optionnelle `worldbank.ts`, sourcée et datée.
 */

export const DEMO_BANNER = "Démo — données fictives";
export const DEMO_NOTICE =
  "Démo — données fictives : toutes les valeurs de cet écran sont simulées pour la démonstration. Elles ne sont ni officielles ni des prévisions.";

/** Les 12 dernières périodes fictives, de la plus ancienne (M-11) à la plus récente (M). */
export const PERIODS = Array.from({ length: 12 }, (_, i) => (i === 11 ? "M" : `M-${11 - i}`));

export type SeriesId =
  | "indice_prix"
  | "inflation_alimentaire"
  | "change_xaf_usd"
  | "balance_commerciale"
  | "emploi_informel"
  | "reserves_mois_import"
  | "stock_cereales_semaines"
  | "indice_matieres_export";

export type SeriesDef = {
  id: SeriesId;
  label: string;
  unit: string;
  /** Sens « favorable » : sert à colorer les variations (hausse bonne ou mauvaise). */
  goodWhen: "up" | "down" | "neutral";
  values: number[];
  description: string;
};

export const NATIONAL_SERIES: SeriesDef[] = [
  { id: "indice_prix", label: "Indice des prix à la consommation (fictif)", unit: "base 100 = M-11", goodWhen: "down", description: "Niveau général des prix, panier fictif.", values: [100, 100.4, 100.9, 101.3, 101.6, 102.2, 102.9, 103.8, 104.6, 105.9, 107.1, 108.4] },
  { id: "inflation_alimentaire", label: "Inflation alimentaire (fictive)", unit: "% sur 12 mois", goodWhen: "down", description: "Hausse des prix des denrées alimentaires.", values: [3.1, 3.3, 3.6, 3.9, 4.2, 4.8, 5.5, 6.3, 7.0, 7.9, 8.8, 9.8] },
  { id: "change_xaf_usd", label: "Change FCFA pour 1 USD (fictif)", unit: "FCFA / USD", goodWhen: "neutral", description: "Cours fictif ; une hausse = le FCFA se déprécie face au dollar.", values: [610, 612, 611, 615, 618, 620, 624, 629, 633, 640, 648, 655] },
  { id: "balance_commerciale", label: "Balance commerciale mensuelle (fictive)", unit: "Md FCFA", goodWhen: "up", description: "Exportations moins importations de biens.", values: [-45, -48, -50, -47, -55, -58, -60, -66, -70, -74, -79, -85] },
  { id: "emploi_informel", label: "Part de l'emploi informel (fictive)", unit: "% de l'emploi", goodWhen: "down", description: "Estimation fictive issue de données terrain simulées.", values: [71.0, 71.1, 71.1, 71.3, 71.4, 71.5, 71.7, 71.8, 72.0, 72.1, 72.3, 72.4] },
  { id: "reserves_mois_import", label: "Réserves de change (fictives)", unit: "mois d'importations", goodWhen: "up", description: "Nombre de mois d'importations couverts.", values: [5.2, 5.1, 5.0, 4.9, 4.7, 4.6, 4.4, 4.2, 4.0, 3.8, 3.6, 3.4] },
  { id: "stock_cereales_semaines", label: "Stocks de céréales (fictifs)", unit: "semaines de consommation", goodWhen: "up", description: "Stocks publics et privés déclarés (simulés).", values: [10.0, 9.8, 9.5, 9.4, 9.0, 8.6, 8.1, 7.6, 7.0, 6.6, 6.1, 5.6] },
  { id: "indice_matieres_export", label: "Prix des matières premières exportées (fictif)", unit: "indice base 100 = M-11", goodWhen: "up", description: "Panier fictif des principaux produits d'exportation.", values: [100, 99, 98, 97, 96, 94, 92, 90, 88, 86, 84, 82] },
];

export type RegionSeed = {
  id: string;
  name: string;
  /** Part fictive de la population. */
  popShare: number;
  priceIndex: number;
  foodInflation: number;
  informalShare: number;
  /** Part fictive de l'agriculture dans l'activité régionale (0–1). */
  agriShare: number;
  /** Exposition fictive aux importations (0–1) : ports, villes, dépendance aux produits importés. */
  importExposure: number;
  /** Éloignement logistique fictif (0–1) : renchérit le transport. */
  remoteness: number;
  /** Prix fictifs sur les marchés locaux (FCFA). */
  market: { mais_kg: number; riz_kg: number; huile_l: number };
};

/** Libellés de régions du Cameroun ; TOUTES les valeurs sont fictives. */
export const REGIONS: RegionSeed[] = [
  { id: "adamaoua", name: "Adamaoua", popShare: 0.05, priceIndex: 107.9, foodInflation: 9.1, informalShare: 78, agriShare: 0.46, importExposure: 0.25, remoteness: 0.7, market: { mais_kg: 260, riz_kg: 640, huile_l: 1350 } },
  { id: "centre", name: "Centre", popShare: 0.2, priceIndex: 108.6, foodInflation: 9.9, informalShare: 66, agriShare: 0.22, importExposure: 0.6, remoteness: 0.2, market: { mais_kg: 300, riz_kg: 620, huile_l: 1300 } },
  { id: "est", name: "Est", popShare: 0.04, priceIndex: 109.4, foodInflation: 10.6, informalShare: 81, agriShare: 0.5, importExposure: 0.2, remoteness: 0.85, market: { mais_kg: 280, riz_kg: 700, huile_l: 1450 } },
  { id: "extreme-nord", name: "Extrême-Nord", popShare: 0.17, priceIndex: 110.2, foodInflation: 11.4, informalShare: 84, agriShare: 0.58, importExposure: 0.15, remoteness: 0.9, market: { mais_kg: 240, riz_kg: 690, huile_l: 1500 } },
  { id: "littoral", name: "Littoral", popShare: 0.15, priceIndex: 108.9, foodInflation: 9.6, informalShare: 62, agriShare: 0.12, importExposure: 0.85, remoteness: 0.1, market: { mais_kg: 320, riz_kg: 600, huile_l: 1250 } },
  { id: "nord", name: "Nord", popShare: 0.1, priceIndex: 109.1, foodInflation: 10.2, informalShare: 82, agriShare: 0.55, importExposure: 0.2, remoteness: 0.8, market: { mais_kg: 235, riz_kg: 670, huile_l: 1450 } },
  { id: "nord-ouest", name: "Nord-Ouest", popShare: 0.08, priceIndex: 107.4, foodInflation: 8.7, informalShare: 76, agriShare: 0.44, importExposure: 0.25, remoteness: 0.55, market: { mais_kg: 255, riz_kg: 650, huile_l: 1380 } },
  { id: "ouest", name: "Ouest", popShare: 0.09, priceIndex: 107.2, foodInflation: 8.4, informalShare: 73, agriShare: 0.4, importExposure: 0.3, remoteness: 0.4, market: { mais_kg: 250, riz_kg: 640, huile_l: 1320 } },
  { id: "sud", name: "Sud", popShare: 0.04, priceIndex: 107.6, foodInflation: 8.9, informalShare: 72, agriShare: 0.38, importExposure: 0.35, remoteness: 0.5, market: { mais_kg: 290, riz_kg: 660, huile_l: 1350 } },
  { id: "sud-ouest", name: "Sud-Ouest", popShare: 0.08, priceIndex: 107.8, foodInflation: 9.0, informalShare: 70, agriShare: 0.36, importExposure: 0.45, remoteness: 0.45, market: { mais_kg: 275, riz_kg: 630, huile_l: 1320 } },
];

export type SectorId = "agriculture" | "commerce" | "artisanat" | "transport" | "services" | "numerique";
export type SectorSeed = { id: SectorId; name: string; gdpShare: number; informalShare: number; importIntensity: number; fuelIntensity: number; productionIndex: number[] };

export const SECTORS: SectorSeed[] = [
  { id: "agriculture", name: "Agriculture & élevage", gdpShare: 0.17, informalShare: 0.9, importIntensity: 0.15, fuelIntensity: 0.2, productionIndex: [100, 101, 101, 102, 101, 100, 99, 99, 98, 97, 97, 96] },
  { id: "commerce", name: "Commerce", gdpShare: 0.2, informalShare: 0.75, importIntensity: 0.55, fuelIntensity: 0.25, productionIndex: [100, 100, 101, 101, 102, 102, 101, 101, 100, 99, 99, 98] },
  { id: "artisanat", name: "Artisanat & industrie légère", gdpShare: 0.14, informalShare: 0.7, importIntensity: 0.4, fuelIntensity: 0.3, productionIndex: [100, 101, 102, 102, 103, 103, 103, 102, 102, 101, 100, 100] },
  { id: "transport", name: "Transport & logistique", gdpShare: 0.08, informalShare: 0.6, importIntensity: 0.35, fuelIntensity: 0.8, productionIndex: [100, 100, 100, 101, 101, 100, 100, 99, 98, 98, 97, 96] },
  { id: "services", name: "Services aux ménages", gdpShare: 0.33, informalShare: 0.5, importIntensity: 0.15, fuelIntensity: 0.1, productionIndex: [100, 101, 101, 102, 102, 103, 103, 104, 104, 104, 105, 105] },
  { id: "numerique", name: "Numérique & télécoms", gdpShare: 0.08, informalShare: 0.2, importIntensity: 0.45, fuelIntensity: 0.05, productionIndex: [100, 102, 103, 105, 106, 108, 109, 111, 112, 114, 115, 117] },
];

export type ProfileId = "agriculteur" | "famille" | "artisan" | "commercant" | "transporteur";
/** Catégories de dépenses du simulateur. */
export type Category = "alimentation" | "energie_transport" | "biens_importes" | "services";

export type ProfileSeed = {
  id: ProfileId;
  label: string;
  description: string;
  /** Panier de dépenses fictif (somme = 1). */
  basket: Record<Category, number>;
  /** Secteur dont dépend principalement le revenu. */
  incomeSector: SectorId;
  /** Revenu mensuel fictif de référence (FCFA), pour exprimer les impacts en montants. */
  monthlyIncome: number;
};

export const PROFILES: ProfileSeed[] = [
  { id: "agriculteur", label: "Agriculteur", description: "Exploitation familiale vivrière et de rente (profil type fictif).", basket: { alimentation: 0.45, energie_transport: 0.15, biens_importes: 0.25, services: 0.15 }, incomeSector: "agriculture", monthlyIncome: 85_000 },
  { id: "famille", label: "Famille à revenu moyen", description: "Ménage urbain de 5 personnes (profil type fictif).", basket: { alimentation: 0.5, energie_transport: 0.18, biens_importes: 0.17, services: 0.15 }, incomeSector: "services", monthlyIncome: 180_000 },
  { id: "artisan", label: "Artisan", description: "Atelier de 1 à 5 personnes : couture, menuiserie, mécanique (profil type fictif).", basket: { alimentation: 0.4, energie_transport: 0.2, biens_importes: 0.25, services: 0.15 }, incomeSector: "artisanat", monthlyIncome: 120_000 },
  { id: "commercant", label: "Commerçant", description: "Commerce de détail de produits courants (profil type fictif).", basket: { alimentation: 0.42, energie_transport: 0.18, biens_importes: 0.25, services: 0.15 }, incomeSector: "commerce", monthlyIncome: 150_000 },
  { id: "transporteur", label: "Transporteur", description: "Moto-taxi ou petit transport de marchandises (profil type fictif).", basket: { alimentation: 0.45, energie_transport: 0.25, biens_importes: 0.15, services: 0.15 }, incomeSector: "transport", monthlyIncome: 110_000 },
];

export type AidProgram = { id: string; name: string; profiles: ProfileId[]; benefit: string; eligibility: string; howTo: string; isExample: true };

/** Programmes d'aide FICTIFS : ils illustrent l'emplacement des vrais programmes publics, à fournir par l'État. */
export const AID_PROGRAMS: AidProgram[] = [
  { id: "prog-intrants", name: "EXEMPLE — Programme d'appui aux intrants agricoles", profiles: ["agriculteur"], benefit: "Bons d'achat d'engrais et de semences (montant d'exemple).", eligibility: "Exploitants enregistrés auprès d'une coopérative (critère d'exemple).", howTo: "Se renseigner auprès de la délégation agricole locale (procédure d'exemple).", isExample: true },
  { id: "prog-stockage", name: "EXEMPLE — Crédit de stockage post-récolte (warrantage)", profiles: ["agriculteur", "commercant"], benefit: "Avance sur récolte stockée dans un magasin agréé (mécanisme d'exemple).", eligibility: "Producteurs ou groupements disposant d'un stock (critère d'exemple).", howTo: "Contacter une institution de microfinance partenaire (exemple).", isExample: true },
  { id: "prog-filets", name: "EXEMPLE — Filets sociaux : transferts monétaires ciblés", profiles: ["famille", "agriculteur"], benefit: "Transfert mensuel temporaire (montant d'exemple).", eligibility: "Ménages vulnérables identifiés par recensement (critère d'exemple).", howTo: "Inscription via la mairie ou les services sociaux (procédure d'exemple).", isExample: true },
  { id: "prog-artisan", name: "EXEMPLE — Fonds de micro-crédit pour artisans", profiles: ["artisan"], benefit: "Prêt d'équipement à taux réduit (conditions d'exemple).", eligibility: "Artisans immatriculés ou en cours de formalisation (critère d'exemple).", howTo: "Dossier auprès d'une chambre des métiers ou d'un guichet partenaire (exemple).", isExample: true },
  { id: "prog-formalisation", name: "EXEMPLE — Accompagnement à la formalisation des micro-entreprises", profiles: ["artisan", "commercant", "transporteur"], benefit: "Appui gratuit aux formalités et à la comptabilité simplifiée (exemple).", eligibility: "Micro-entreprises de moins de 5 personnes (critère d'exemple).", howTo: "Guichet d'accompagnement des entreprises (exemple).", isExample: true },
  { id: "prog-carburant", name: "EXEMPLE — Bon carburant temporaire pour transporteurs", profiles: ["transporteur"], benefit: "Réduction ponctuelle sur le carburant (mécanisme d'exemple).", eligibility: "Transporteurs enregistrés (critère d'exemple).", howTo: "Syndicat de transporteurs / mairie (procédure d'exemple).", isExample: true },
];

export type NewsEffect = "prix_alimentaires" | "prix_importes" | "fcfa_apprecie" | "fcfa_deprecie" | "carburant" | "credit" | "aide_publique";
export type NewsItem = { id: string; title: string; summary: string; effects: NewsEffect[]; isExample: true };

/** Actualités FICTIVES servant de démonstration à la traduction « actualité → conseils ». */
export const NEWS: NewsItem[] = [
  { id: "actu-inflation", title: "EXEMPLE — Les prix des denrées alimentaires accélèrent", summary: "Actualité fictive : l'inflation alimentaire (démo) approche 10 % sur 12 mois, avec des écarts selon les régions.", effects: ["prix_alimentaires"], isExample: true },
  { id: "actu-fcfa-apprecie", title: "EXEMPLE — Le FCFA s'apprécie face au dollar", summary: "Actualité fictive : le FCFA gagne de la valeur face au dollar, ce qui rend les importations en dollars moins chères et les exportations moins rémunératrices.", effects: ["fcfa_apprecie"], isExample: true },
  { id: "actu-fcfa-deprecie", title: "EXEMPLE — Le FCFA se déprécie face au dollar", summary: "Actualité fictive : le dollar devient plus cher, les produits importés facturés en dollars renchérissent.", effects: ["fcfa_deprecie", "prix_importes"], isExample: true },
  { id: "actu-carburant", title: "EXEMPLE — Hausse du prix du carburant à la pompe", summary: "Actualité fictive : le prix du carburant augmente, ce qui se répercute sur le transport et les prix des marchés.", effects: ["carburant", "prix_alimentaires"], isExample: true },
  { id: "actu-credit", title: "EXEMPLE — Le crédit devient plus cher", summary: "Actualité fictive : les taux proposés par les banques et microfinances augmentent.", effects: ["credit"], isExample: true },
  { id: "actu-programme", title: "EXEMPLE — Ouverture d'un programme public d'appui", summary: "Actualité fictive : un programme d'aide est annoncé pour les petits producteurs et artisans.", effects: ["aide_publique"], isExample: true },
];

export const profileById = (id: string) => PROFILES.find((p) => p.id === id);
export const regionById = (id: string) => REGIONS.find((r) => r.id === id || r.name.toLowerCase() === id.toLowerCase());
export const seriesById = (id: SeriesId) => NATIONAL_SERIES.find((s) => s.id === id)!;
