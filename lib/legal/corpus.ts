import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadDocumentChunks, searchDocuments, type DocumentChunk, type SearchResult } from "@/lib/documents";
import { getCitations, type Citation } from "./citations";

/**
 * Corpus juridique unifié :
 *  1. PDF officiels indexés (reglementation/, publications/, corpus/officiel/) → data/documents.json
 *  2. Textes officiels texte/JSON ingérés (corpus/officiel) → data/corpus-officiel.json
 *  3. Seed d'EXEMPLE (corpus/exemples) — toujours marqué non officiel, utilisé en complément.
 */
export type CorpusChunk = DocumentChunk & { isExample?: boolean };

let ingestedCache: CorpusChunk[] | null = null;
let exampleCache: CorpusChunk[] | null = null;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function loadIngestedOfficial(): Promise<CorpusChunk[]> {
  if (!ingestedCache) ingestedCache = await readJson<CorpusChunk[]>(path.join(process.cwd(), "data", "corpus-officiel.json"), []);
  return ingestedCache;
}

type ExampleFile = { documents: { titre: string; categorie: string; articles: { numero: string; texte: string }[] }[] };

export async function loadExampleCorpus(): Promise<CorpusChunk[]> {
  if (exampleCache) return exampleCache;
  const data = await readJson<ExampleFile>(
    path.join(process.cwd(), "corpus", "exemples", "creation-entreprise.exemple.json"),
    { documents: [] },
  );
  exampleCache = data.documents.flatMap((doc, d) =>
    doc.articles.map((article, a) => ({
      id: `exemple-${d}-${a}`,
      source: "corpus/exemples/creation-entreprise.exemple.json",
      title: doc.titre,
      category: doc.categorie,
      page: a + 1,
      text: article.texte,
      isExample: true,
    })),
  );
  return exampleCache;
}

export type LegalSearch = {
  citations: Citation[];
  officialCount: number;
  exampleCount: number;
  indexReady: boolean;
};

/** Tableaux fusionnés réutilisés tant que les sources n'ont pas changé (le cache BM25 est indexé par tableau). */
let merged: { parts: unknown[]; official: DocumentChunk[]; withExamples: DocumentChunk[] } | null = null;
function mergedCorpus(pdfChunks: DocumentChunk[], ingested: DocumentChunk[], examples: DocumentChunk[]) {
  const parts = [pdfChunks, ingested, examples, pdfChunks.length, ingested.length, examples.length];
  if (merged && merged.parts.every((p, i) => p === parts[i])) return merged;
  const official = [...pdfChunks, ...ingested];
  merged = { parts, official, withExamples: [...official, ...examples] };
  return merged;
}

export async function searchLegalCorpus(question: string, limit = 5): Promise<LegalSearch> {
  const [pdfChunks, ingested, examples] = await Promise.all([
    loadDocumentChunks(),
    loadIngestedOfficial(),
    loadExampleCorpus(),
  ]);
  const { official, withExamples } = mergedCorpus(pdfChunks, ingested, examples);
  const officialResults: SearchResult[] = official.length ? searchDocuments(question, official, limit) : [];
  // Score comparable : on classe les exemples dans le même espace de recherche que le corpus officiel.
  const combined = official.length ? searchDocuments(question, withExamples, limit + 3) : searchDocuments(question, examples, 2);
  const exampleIds = new Set(examples.map((e) => e.id));
  const keptExamples = combined
    .filter((r) => exampleIds.has(r.id))
    .slice(0, 2)
    .map((r) => ({ ...r, isExample: true }));
  const merged = [...officialResults.slice(0, limit - Math.min(keptExamples.length, 2)), ...keptExamples].slice(0, limit);
  const citations = getCitations(merged, official);
  return {
    citations,
    officialCount: citations.filter((c) => !c.isExample).length,
    exampleCount: citations.filter((c) => c.isExample).length,
    indexReady: pdfChunks.length > 0,
  };
}

/** Documents officiels distincts avec leur texte intégral (pour la veille réglementaire). */
export async function listOfficialDocuments(): Promise<{ source: string; title: string; category: string; sample: string }[]> {
  const [pdfChunks, ingested] = await Promise.all([loadDocumentChunks(), loadIngestedOfficial()]);
  const bySource = new Map<string, { source: string; title: string; category: string; parts: string[] }>();
  for (const chunk of [...pdfChunks, ...ingested]) {
    const existing = bySource.get(chunk.source);
    if (existing) existing.parts.push(chunk.text);
    else bySource.set(chunk.source, { source: chunk.source, title: chunk.title, category: chunk.category, parts: [chunk.text] });
  }
  return [...bySource.values()].map(({ parts, ...doc }) => ({ ...doc, sample: parts.join(" ") }));
}
