import { groundingLabel, groundQuery, type Grounding } from "@/lib/legal/grounding";
import type { LegalSnapshot } from "./types";

/**
 * Instantané juridique figé au moment d'une décision : on conserve les références (document, page, articles)
 * ET l'extrait tel qu'il figurait dans le corpus, pour pouvoir répondre plus tard
 * « quels textes avions-nous consultés ? » même si le corpus évolue. Aucun texte n'est inventé :
 * si rien n'est trouvé, le statut est « non_couvert ».
 */
export async function snapshotLegal(query: string, limit = 3): Promise<LegalSnapshot> {
  const g = await groundQuery(query, limit);
  return toSnapshot(g);
}

export function toSnapshot(g: Grounding): LegalSnapshot {
  return {
    query: g.query,
    status: g.status,
    label: groundingLabel(g),
    capturedAt: new Date().toISOString(),
    sources: g.citations.map((c) => ({
      document: c.legalTitle ?? c.title,
      page: c.page,
      articles: c.articles,
      file: c.file,
      isExample: Boolean(c.isExample),
      excerpt: c.excerpt.slice(0, 400),
    })),
  };
}

/** Lien vers la page du PDF officiel (route existante /api/document). */
export function sourceHref(file: string, page: number): string | null {
  if (!file || !/\.pdf$/i.test(file)) return null;
  return `/api/document?file=${encodeURIComponent(file)}#page=${page}`;
}

export function basisData(g: Grounding & { label: string }) {
  return {
    statut: g.status,
    libelle: g.label,
    sources: g.sources.map((x) => ({ id: x.id, document: x.document, page: x.page, articles: x.articles, exemple_non_officiel: x.isExample })),
    consigne: g.status === "non_couvert" ? "Aucun texte du corpus ne couvre ce point : dis-le explicitement, n'invente aucune règle." : "Cite ces sources [Sx] pour tout point juridique.",
  };
}

export function snapshotLines(l: LegalSnapshot): string[] {
  const off = l.sources.filter((s) => !s.isExample);
  const ex = l.sources.filter((s) => s.isExample);
  const out: string[] = [];
  if (l.status === "non_couvert" || !off.length) out.push(`⚠️ Non couvert par le corpus officiel au moment de la décision (recherche : « ${l.query} »).`);
  else for (const s of off) out.push(`${s.document}, page ${s.page}${s.articles.length ? `, art. ${s.articles.slice(0, 4).join(", ")}` : ""}`);
  for (const s of ex) out.push(`⚠️ Texte d'EXEMPLE, non officiel — ${s.document}`);
  return out;
}
