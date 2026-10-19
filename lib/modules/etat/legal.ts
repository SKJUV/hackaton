import { groundingLabel, groundQuery, type Grounding } from "@/lib/legal/grounding";

/** Références juridiques compactes pour l'UI (même ancrage que l'agent : corpus officiel, ou « non couvert »). */
export async function legalRefs(query: string, limit = 3, ground: (q: string, l: number) => Promise<Grounding> = groundQuery) {
  const g = await ground(query, limit);
  return {
    query,
    statut: g.status,
    libelle: groundingLabel(g),
    sources: g.citations.map((c) => ({ id: c.id, document: c.legalTitle ?? c.title, page: c.page, articles: c.articles, file: c.file, isExample: Boolean(c.isExample), extrait: c.excerpt.slice(0, 280) })),
  };
}
export type LegalRefs = Awaited<ReturnType<typeof legalRefs>>;
