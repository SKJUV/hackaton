import { readFile } from "node:fs/promises";
import path from "node:path";

export type DocumentChunk = {
  id: string;
  source: string;
  title: string;
  category: string;
  page: number;
  text: string;
};

export type SearchResult = DocumentChunk & { score: number };

const indexPath = path.join(process.cwd(), "data", "documents.json");
const stopWords = new Set(
  "alors au aucun aussi autre avant avec avoir bon car ce cela ces ceux chaque ci comme comment dans de des du dedans dehors depuis deux elle elles en encore est et eu fait faites fois font hors ici il ils je juste la le les leur lui ma mais me même mes moi mon ne ni notre nous on ou par pas pour pourquoi quand que quel quelle quels quelles qui sa sans se ses si son sont sous sur ta te tes toi ton tous tout trop très tu un une vos votre vous".split(
    " ",
  ),
);

let cachedChunks: DocumentChunk[] | null = null;

export async function loadDocumentChunks(): Promise<DocumentChunk[]> {
  if (cachedChunks) return cachedChunks;

  let raw: string;
  try {
    raw = await readFile(indexPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("The document index has an invalid format.");
  }

  cachedChunks = parsed as DocumentChunk[];
  return cachedChunks;
}

export function terms(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .match(/[\p{L}\p{N}]{2,}/gu)
    ?.filter((term) => !stopWords.has(term)) ?? [];
}

const relatedLegalTerms: Record<string, string[]> = {
  cybercriminalite: [
    "infraction",
    "frauduleux",
    "acces",
    "systeme",
    "informatique",
    "interception",
    "atteinte",
    "integrite",
  ],
  cybersecurite: [
    "securite",
    "systeme",
    "information",
    "reseau",
    "donnees",
    "protection",
  ],
  donnees: ["personnelles", "vie", "privee", "collecte", "traitement"],
  consommateur: ["usager", "client", "abonne", "reclamation", "plainte"],
  concurrence: ["concurrentielle", "entente", "dominante", "marche", "abus", "prix"],
  operateur: ["telecommunications", "communications", "electroniques", "abonne"],
  facture: ["facturation", "tarif", "paiement", "contestation"],
  recours: ["plainte", "reclamation", "conciliation", "arbitrage", "reparation"],
  internet: ["service", "fourniture", "declaration", "public", "communications", "electroniques"],
  mobile: ["reseau", "radioelectrique", "public", "licence", "frequences", "operateur"],
  virtuel: ["operateur", "reseau", "public", "licence", "communications", "electroniques"],
  antennes: ["installation", "radioelectrique", "agrement", "autorisation"],
  antenne: ["installation", "radioelectrique", "agrement", "autorisation"],
  telephone: ["terminal", "homologation", "equipement", "modele", "type"],
  telephones: ["terminal", "homologation", "equipement", "modele", "type"],
  equipement: ["homologation", "terminal", "conformite", "agrement", "modele", "type"],
  equipements: ["homologation", "terminal", "conformite", "agrement", "modele", "type"],
  importer: ["importes", "homologation", "equipements", "terminaux", "commercialisation"],
  vendre: ["homologation", "equipements", "terminaux", "commercialisation"],
  vente: ["homologation", "equipements", "terminaux", "commercialisation"],
  laboratoire: ["essais", "mesures", "agrement", "equipements", "terminaux"],
  tester: ["essais", "mesures", "laboratoire", "agrement", "certification"],
  frequences: ["assignation", "radioelectrique", "redevance", "temporaire", "disponibilite"],
  frequence: ["assignation", "radioelectrique", "redevance", "temporaire", "disponibilite"],
  festival: ["evenement", "temporaire", "assignation", "frequences", "radioelectrique"],
  boutique: ["commerce", "electronique", "vendeur", "consommateur", "commande", "information"],
  signature: ["electronique", "certificat", "certification", "authentification", "preuve"],
  collecte: ["donnees", "personnelles", "traitement", "responsable", "vie", "privee"],
  colis: ["postal", "poste", "courrier", "envoi", "operateur"],
  livraison: ["postal", "poste", "colis", "courrier", "operateur"],
  courrier: ["postal", "poste", "colis", "service", "operateur"],
  relais: ["postal", "poste", "colis", "distribution", "operateur"],
  postal: ["poste", "operateur", "reseau", "autorisation", "concession", "service"],
  postaux: ["poste", "operateur", "reseau", "autorisation", "concession", "service"],
  poste: ["postal", "operateur", "licence", "concession", "courrier", "distribution"],
  forfaits: ["abonne", "identification", "identite", "module", "sim", "operateur"],
  prepayes: ["abonne", "identification", "identite", "module", "sim", "operateur"],
  interconnexion: ["acces", "reseau", "degroupage", "partage", "catalogue", "operateur"],
  itinérance: ["national", "operateur", "reseau", "couverture", "accord"],
  itinerance: ["national", "operateur", "reseau", "couverture", "accord"],
  autorisations: ["autorisation", "licence", "concession", "agrement", "declaration"],
};

const operatorSetupTerms = [
  "concession",
  "licence",
  "autorisation",
  "appel",
  "concurrence",
  "cahier",
  "charges",
  "demande",
  "reseau",
  "couverture",
  "redevances",
  "entree",
];

function isPrimarySource(source: string): boolean {
  const normalized = source.toLocaleLowerCase("fr");
  return (
    normalized.startsWith("reglementation/lois/") ||
    normalized.startsWith("reglementation/décret/") ||
    normalized.startsWith("reglementation/arrete/") ||
    normalized.startsWith("reglementation/decision/") ||
    normalized.includes("recueil")
  );
}

type CorpusStats = {
  documentFrequency: Map<string, number>;
  averageLength: number;
  perChunk: { length: number; frequencies: Map<string, number> }[];
};

/**
 * Statistiques BM25 du corpus (fréquences par chunk, fréquence documentaire, longueur moyenne),
 * calculées une seule fois par tableau de chunks : évite de re-tokeniser tout le corpus à chaque requête.
 */
const statsCache = new WeakMap<DocumentChunk[], CorpusStats>();
function corpusStats(chunks: DocumentChunk[]): CorpusStats {
  const hit = statsCache.get(chunks);
  if (hit && hit.perChunk.length === chunks.length) return hit;
  const documentFrequency = new Map<string, number>();
  let totalLength = 0;
  const perChunk = chunks.map((chunk) => {
    const chunkTerms = terms(chunk.text);
    totalLength += chunkTerms.length;
    const frequencies = new Map<string, number>();
    for (const term of chunkTerms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    for (const term of frequencies.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    return { length: chunkTerms.length, frequencies };
  });
  const stats = { documentFrequency, averageLength: chunks.length ? totalLength / chunks.length : 0, perChunk };
  statsCache.set(chunks, stats);
  return stats;
}

export function searchDocuments(
  query: string,
  chunks: DocumentChunk[],
  limit = 6,
): SearchResult[] {
  const originalQueryTerms = terms(query);
  const normalizedQuery = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
  const statuteReferences = [
    {
      query: /\b2010\s*[/.-]?\s*013\b/,
      source: /loi_2010-013_communications_electroniques\.pdf$/,
    },
    {
      query: /\b2015\s*[/.-]?\s*0*6\b/,
      source: /(?:loi_2015_06.*communications_electroniques|loi-n°2015-006).*\.pdf$/,
    },
    {
      query: /\b2010\s*[/.-]?\s*012\b/,
      source: /loi_2010-012_cybersecurite_cybercriminalite\.pdf$/,
    },
    {
      query: /\b2010\s*[/.-]?\s*021\b/,
      source: /loi-commerce-electronique-n-2010-021.*\.pdf$/,
    },
    {
      query: /\b2011\s*[/.-]?\s*012\b/,
      source: /loi-cadre-n°2011-012.*protection-du-consommateur\.pdf$/,
    },
    {
      query: /\b98\s*[/.-]?\s*013\b/,
      source: /loi_98_013_1407_concurrence\.pdf$/,
    },
    {
      query: /\b2020\s*[/.-]?\s*004\b/,
      source: /recueil-des-textes-du-secteur-des-postes-telecommunications-et-tic-edition-2023\.pdf$/,
    },
  ].filter((reference) => reference.query.test(normalizedQuery));
  const asksAboutCyberLaw =
    /\b(cybersecurite|cybercriminalite|informatique|interception|confidentialite|donnees personnelles|systeme informatique)\b/.test(
      normalizedQuery,
    );
  const asksAboutElectronicCommerceLaw =
    /\b(commerce electronique|boutique en ligne|commande electronique|contrat.{0,20}distance|vendeur en ligne|communication commerciale)\b/.test(
      normalizedQuery,
    );
  const asksAboutConsumerLaw =
    /\b(consommateur|consommateurs|facture|facturation|pratique commerciale|trompeuse|produit.{0,12}defaut|service.{0,18}demande|droits.{0,15}client)\b/.test(
      normalizedQuery,
    );
  const asksAboutCompetitionLaw =
    /\b(concurrence|concurrent|concurrents|position dominante|fixer les prix|pratiques anticoncurrentielles)\b/.test(
      normalizedQuery,
    );
  const asksAboutTelecomLaw =
    /\b(telecom|telecommunications|communication electronique|frequences|reseau.{0,20}public|infrastructures de communications)\b/.test(
      normalizedQuery,
    );
  const isBusinessQuestion = originalQueryTerms.some((term) =>
    ["veux", "veut", "creer", "lancer", "ouvrir", "importer", "developper", "business", "entreprise"].includes(term),
  );
  const asksAboutStartingTelecomActivity =
    (originalQueryTerms.some((term) => ["operateur", "telecom", "telecommunications"].includes(term)) ||
      originalQueryTerms.includes("internet")) &&
    (isBusinessQuestion ||
      originalQueryTerms.some((term) =>
        ["devenir", "obtenir", "demarche", "demarches", "procedure", "procedures", "exploiter"].includes(term),
      )) &&
    !originalQueryTerms.some((term) =>
      [
        "identification",
        "abonne",
        "abonnes",
        "forfait",
        "forfaits",
        "prepayes",
        "sim",
        "itinérance",
        "itinerance",
        "interconnexion",
      ].includes(term),
    );
  const asksAboutPostalBusiness =
    originalQueryTerms.some((term) =>
      ["postal", "postaux", "poste", "colis", "livraison", "courrier", "relais"].includes(term),
    );
  const asksAboutChildren = originalQueryTerms.some((term) =>
    ["enfant", "enfants", "mineur", "mineurs", "parental"].includes(term),
  );
  const queryTerms = [
    ...new Set([
      ...originalQueryTerms,
      ...originalQueryTerms.flatMap((term) => relatedLegalTerms[term] ?? []),
      ...(asksAboutStartingTelecomActivity ? operatorSetupTerms : []),
      ...(asksAboutPostalBusiness
        ? [
            "licence",
            "concession",
            "declaration",
            "reseau",
            "collecte",
            "tri",
            "transport",
            "distribution",
            "courrier",
            "non",
            "reserves",
            "redevance",
          ]
        : []),
    ]),
  ];
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const { documentFrequency, averageLength, perChunk } = corpusStats(chunks);

  const results = chunks
    .map((chunk, index) => {
      const { length: chunkLength, frequencies } = perChunk[index];

      let score = 0;
      for (const term of queryTerms) {
        const frequency = frequencies.get(term) ?? 0;
        if (frequency === 0) continue;

        const inverseDocumentFrequency = Math.log(
          1 +
            (chunks.length -
              (documentFrequency.get(term) ?? 0) +
              0.5) /
              ((documentFrequency.get(term) ?? 0) + 0.5),
        );
        const lengthNormalization =
          1.2 *
          (1 -
            0.75 +
            0.75 * (chunkLength / Math.max(averageLength, 1)));
        score +=
          inverseDocumentFrequency *
          ((frequency * 2.2) / (frequency + lengthNormalization));
      }

      const sourcePath = chunk.source.toLocaleLowerCase("fr");
      const isOfficialRegulation =
        sourcePath.startsWith("reglementation/lois/") ||
        sourcePath.startsWith("reglementation/décret/") ||
        sourcePath.startsWith("reglementation/arrete/") ||
        sourcePath.startsWith("reglementation/decision/");
      const isRegionalDirective =
        sourcePath.startsWith("reglementation/directives/") ||
        sourcePath.includes("cemac");
      const isLegalCompilation = sourcePath.includes("recueil");
      const isOfficialLegalSource =
        isOfficialRegulation ||
        (isLegalCompilation &&
          (sourcePath.startsWith("reglementation/") ||
            chunk.title.toLocaleLowerCase("fr").includes("textes")));
      const sourceWeight = isOfficialRegulation
        ? 2.2
        : isRegionalDirective
          ? 0.9
        : isOfficialLegalSource
          ? 1.7
          : isLegalCompilation
            ? 1.35
            : sourcePath.startsWith("publications/appel")
              ? 0.25
              : 0.55;
      const childSpecificPenalty =
        !asksAboutChildren &&
        /\b(enfant|enfants|mineur|mineurs|parental|scolaire)\b/i.test(chunk.text)
          ? 0.2
          : 1;
      const licensingProcedureBoost =
        asksAboutStartingTelecomActivity &&
        sourcePath.startsWith("reglementation/lois/") &&
        /appel(?:s)?\s+(?:à|a)\s+concurrence|cahier(?:s)?\s+de(?:s)?\s+charge(?:s)?|convention de concession|droit d['’]entrée|personne morale adjudicataire/i.test(
          chunk.text,
        )
          ? 3
          : 1;
      const licenseScopeBoost =
        asksAboutStartingTelecomActivity &&
        sourcePath.startsWith("reglementation/lois/") &&
        /réseaux?\s+(?:expérimentaux|virtuels)|réseaux?\s+de\s+collecte|zones?\s+rurales/i.test(
          chunk.text,
        )
          ? 5.5
          : 1;
      const frequencyLicensingBoost =
        asksAboutStartingTelecomActivity &&
        sourcePath.startsWith("reglementation/lois/") &&
        /article\s*12|disponibilité des fréquences|appel à concurrence/i.test(
          chunk.text,
        )
          ? 4
          : 1;
      const concessionApprovalBoost =
        asksAboutStartingTelecomActivity &&
        sourcePath.startsWith("reglementation/lois/") &&
        /convention de concession|approuvés? par décret du Président/i.test(chunk.text)
          ? 2.5
          : 1;
      const postalLicenseBoost =
        asksAboutPostalBusiness &&
        sourcePath.includes("recueil") &&
        /article\s*38/i.test(chunk.text)
          ? 15
          : asksAboutPostalBusiness &&
              sourcePath.includes("recueil") &&
              /article\s*34|licence est délivrée|services postaux non réservés|courrier accéléré/i.test(
                chunk.text,
              )
            ? 5
          : 1;
      const equipmentComplianceBoost =
        originalQueryTerms.some((term) =>
          ["equipement", "equipements", "telephone", "telephones", "importer", "vendre", "vente"].includes(term),
        ) &&
        /homologation|équipements? terminaux|agrément.*équipements/i.test(chunk.text)
          ? 12
          : 1;
      const matchesExplicitStatute =
        statuteReferences.some((reference) => reference.source.test(sourcePath));
      const statuteTopicBoost =
        (asksAboutCyberLaw &&
        sourcePath.endsWith("loi_2010-012_cybersecurite_cybercriminalite.pdf")) ||
        (asksAboutElectronicCommerceLaw &&
          sourcePath.endsWith("loi-commerce-electronique-n-2010-021-du-21-12-2010.pdf")) ||
        (asksAboutConsumerLaw &&
          sourcePath.endsWith(
            "loi-cadre-n°2011-012-du-06-mai-2011-sur-la-protection-du-consommateur.pdf",
          )) ||
        (asksAboutCompetitionLaw &&
          sourcePath.endsWith("loi_98_013_1407_concurrence.pdf")) ||
        (asksAboutTelecomLaw &&
          sourcePath.endsWith("loi_2010-013_communications_electroniques.pdf"))
          ? 4
          : 1;
      const explicitStatuteBoost = matchesExplicitStatute ? 12 : 1;

      return {
        ...chunk,
        score:
          score *
          sourceWeight *
          childSpecificPenalty *
          licensingProcedureBoost *
          licenseScopeBoost *
          frequencyLicensingBoost *
          concessionApprovalBoost *
          postalLicenseBoost *
          equipmentComplianceBoost *
          statuteTopicBoost *
          explicitStatuteBoost,
      };
    })
    .filter(
      (result) =>
        result.score > 0 &&
        (!asksAboutPostalBusiness ||
          (result.source.toLocaleLowerCase("fr").includes("recueil") &&
            /postal|postaux|courrier|colis/i.test(result.text))),
    )
    .sort((a, b) => b.score - a.score);

  const selectedResults: SearchResult[] = [];
  const resultCountByDocument = new Map<string, number>();
  const selectedSourcePages = new Set<string>();
  for (const result of results) {
    const primarySource = isPrimarySource(result.source);
    const currentCount = resultCountByDocument.get(result.source) ?? 0;
    const sourcePage = `${result.source}:${result.page}`;
    if (asksAboutStartingTelecomActivity && selectedSourcePages.has(sourcePage)) {
      continue;
    }
    const perDocumentLimit = primarySource
      ? asksAboutPostalBusiness && result.source.toLocaleLowerCase("fr").includes("recueil")
        ? 5
        : asksAboutStartingTelecomActivity &&
        result.source.toLocaleLowerCase("fr").startsWith("reglementation/lois/")
        ? 4
        : 2
      : 1;
    if (currentCount >= perDocumentLimit) continue;
    resultCountByDocument.set(result.source, currentCount + 1);
    selectedSourcePages.add(sourcePage);
    selectedResults.push(result);
    if (selectedResults.length === limit) break;
  }

  return selectedResults
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
