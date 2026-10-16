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

function terms(text: string): string[] {
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
  operateur: ["telecommunications", "communications", "electroniques", "abonne"],
  facture: ["facturation", "tarif", "paiement", "contestation"],
  recours: ["plainte", "reclamation", "conciliation", "arbitrage", "reparation"],
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

export function searchDocuments(
  query: string,
  chunks: DocumentChunk[],
  limit = 6,
): SearchResult[] {
  const originalQueryTerms = terms(query);
  const asksAboutStartingTelecomActivity =
    originalQueryTerms.some((term) =>
      ["operateur", "telecom", "telecommunications"].includes(term),
    ) &&
    originalQueryTerms.some((term) =>
      [
        "devenir",
        "creer",
        "lancer",
        "ouvrir",
        "obtenir",
        "demarche",
        "demarches",
        "procedure",
        "procedures",
        "condition",
        "conditions",
        "exploiter",
      ].includes(term),
    );
  const asksAboutChildren = originalQueryTerms.some((term) =>
    ["enfant", "enfants", "mineur", "mineurs", "parental"].includes(term),
  );
  const queryTerms = [
    ...new Set([
      ...originalQueryTerms,
      ...originalQueryTerms.flatMap((term) => relatedLegalTerms[term] ?? []),
      ...(asksAboutStartingTelecomActivity ? operatorSetupTerms : []),
    ]),
  ];
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const documentFrequency = new Map<string, number>();
  for (const chunk of chunks) {
    for (const term of new Set(terms(chunk.text))) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const averageLength =
    chunks.reduce((total, chunk) => total + terms(chunk.text).length, 0) /
    chunks.length;

  const results = chunks
    .map((chunk) => {
      const chunkTerms = terms(chunk.text);
      const frequencies = new Map<string, number>();
      for (const term of chunkTerms) {
        frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
      }

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
            0.75 * (chunkTerms.length / Math.max(averageLength, 1)));
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

      return {
        ...chunk,
        score:
          score *
          sourceWeight *
          childSpecificPenalty *
          licensingProcedureBoost *
          licenseScopeBoost *
          frequencyLicensingBoost *
          concessionApprovalBoost,
      };
    })
    .filter((result) => result.score > 0)
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
      ? asksAboutStartingTelecomActivity &&
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
