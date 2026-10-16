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

export function searchDocuments(
  query: string,
  chunks: DocumentChunk[],
  limit = 6,
): SearchResult[] {
  const queryTerms = [...new Set(terms(query))];
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
        sourcePath.startsWith("reglementation/decision/") ||
        sourcePath.startsWith("reglementation/directives/");
      const isLegalCompilation =
        sourcePath.includes("recueil") || sourcePath.includes("recueil de texte");
      const isOfficialLegalSource =
        isOfficialRegulation ||
        (isLegalCompilation &&
          (sourcePath.startsWith("reglementation/") ||
            chunk.title.toLocaleLowerCase("fr").includes("textes")));
      const sourceWeight = isOfficialRegulation
        ? 2.2
        : isOfficialLegalSource
          ? 1.7
          : isLegalCompilation
            ? 1.35
            : sourcePath.startsWith("publications/appel")
              ? 0.25
              : 0.55;

      return { ...chunk, score: score * sourceWeight };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestPerDocument = new Map<string, SearchResult>();
  for (const result of results) {
    const current = bestPerDocument.get(result.source);
    if (!current || result.score > current.score) {
      bestPerDocument.set(result.source, result);
    }
  }

  return [...bestPerDocument.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
