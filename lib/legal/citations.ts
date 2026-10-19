import type { DocumentChunk, SearchResult } from "@/lib/documents";

/** Citation renvoyée au client : extrait officiel + repères juridiques. */
export type Citation = {
  id: string;
  title: string;
  category: string;
  page: number;
  excerpt: string;
  file: string;
  articles: string[];
  isRecueil: boolean;
  legalTitle: string | null;
  /** true si la source provient du seed d'exemple (non officiel). */
  isExample?: boolean;
};

export function getArticles(text: string): string[] {
  const articles = new Set<string>();
  const pattern = /\bARTICLES?\s+(?:N[°º]\s*)?(\d{1,3}(?:\s*(?:bis|ter|quater))?)/gi;
  for (const match of text.matchAll(pattern)) {
    articles.add(match[1].replace(/\s+/g, " ").trim());
  }
  return [...articles];
}

export function isRecueil(title: string, source: string): boolean {
  return `${title} ${source}`
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .includes("recueil");
}

export function getRecueilLawTitle(source: string, page: number, chunks: DocumentChunk[]): string | null {
  const nearbyChunks = chunks
    .filter((chunk) => chunk.source === source && chunk.page <= page && page - chunk.page <= 30)
    .sort((left, right) => right.page - left.page);

  for (const chunk of nearbyChunks) {
    if (!/le parlement a délibéré et adopté/i.test(chunk.text)) continue;
    const match = chunk.text.match(
      /\b(LOI\s+N[°º]\s*[\w./-]+[\s\S]{0,180}?)(?=\s+(?:Le Parlement a délibéré et adopté|ARTICLE\s+\d{1,3}\b))/i,
    );
    if (match) return match[1].replace(/\s+/g, " ").replace(/[;,.]+$/, "").trim();
  }
  return null;
}

export function getCitations(results: SearchResult[], chunks: DocumentChunk[]): Citation[] {
  return results.map((result, index) => {
    const recueil = isRecueil(result.title, result.source);
    return {
      id: `S${index + 1}`,
      title: result.title,
      category: result.category,
      page: result.page,
      excerpt: result.text,
      file: result.source,
      articles: getArticles(result.text),
      isRecueil: recueil,
      legalTitle: recueil ? getRecueilLawTitle(result.source, result.page, chunks) : result.title,
      isExample: (result as SearchResult & { isExample?: boolean }).isExample ?? false,
    };
  });
}

export function formatSourceContext(citations: Citation[]): string {
  return citations
    .map(
      (citation) =>
        `[${citation.id}] ${citation.legalTitle ?? citation.title} — ${citation.category}, page PDF ${citation.page}${
          citation.isRecueil ? " (source issue d’un recueil)" : ""
        }${citation.isExample ? " (TEXTE D'EXEMPLE NON OFFICIEL)" : ""}${
          citation.articles.length ? `, articles repérés : ${citation.articles.join(", ")}` : ""
        }\n${citation.excerpt}`,
    )
    .join("\n\n---\n\n");
}
