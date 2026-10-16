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

export async function searchLegalCorpus(question: string, limit = 5): Promise<LegalSearch> {
  const [pdfChunks, ingested, examples] = await Promise.all([
    loadDocumentChunks(),
    loadIngestedOfficial(),
    loadExampleCorpus(),
  ]);
  const official = [...pdfChunks, ...ingested];
  const officialResults: SearchResult[] = official.length ? searchDocuments(question, official, limit) : [];
  const exampleResults = searchDocuments(question, examples, 2).map((r) => ({ ...r, isExample: true }));
  const best = officialResults[0]?.score ?? 0;
  const keptExamples = exampleResults.filter(
    (r) => officialResults.length < 2 || r.score >= best * 0.6,
  );
  const merged = [...officialResults.slice(0, limit - Math.min(keptExamples.length, 2)), ...keptExamples].slice(0, limit);
  const citations = getCitations(merged, official);
  return {
    citations,
    officialCount: citations.filter((c) => !c.isExample).length,
    exampleCount: citations.filter((c) => c.isExample).length,
    indexReady: pdfChunks.length > 0,
  };
}

/** Liste des documents officiels distincts (pour la veille réglementaire). */
export async function listOfficialDocuments(): Promise<{ source: string; title: string; category: string; sample: string }[]> {
  const [pdfChunks, ingested] = await Promise.all([loadDocumentChunks(), loadIngestedOfficial()]);
  const bySource = new Map<string, { source: string; title: string; category: string; sample: string }>();
  for (const chunk of [...pdfChunks, ...ingested]) {
    const existing = bySource.get(chunk.source);
    if (!existing) bySource.set(chunk.source, { source: chunk.source, title: chunk.title, category: chunk.category, sample: chunk.text.slice(0, 4000) });
    else if (existing.sample.length < 4000) existing.sample += ` ${chunk.text.slice(0, 4000 - existing.sample.length)}`;
  }
  return [...bySource.values()];
}
