import { getArticles } from "@/lib/legal/citations";
import { groundingLabel, groundQuery, type Grounding } from "@/lib/legal/grounding";
import type { ArticleRow, Ctx, RegulatoryTheme } from "./types";

/**
 * Ancrage juridique du module : même mécanique que `legalBasis()` (lib/agent/tools.ts) — recherche dans le
 * corpus officiel, renumérotation [S1], [S2]… dans la conversation, statut fondé / partiel / non couvert.
 * Réimplémenté ici pour éviter un import circulaire avec le registre d'outils.
 */
const cache = new Map<string, { at: number; g: Grounding }>();

async function cachedGround(query: string, limit: number) {
  const key = `${limit}|${query}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.g;
  const g = await groundQuery(query, limit);
  cache.set(key, { at: Date.now(), g });
  return g;
}

function attach(ctx: Ctx, base: Grounding): Grounding & { label: string } {
  const offset = ctx.citations.length;
  const citations = base.citations.map((c, i) => ({ ...c, id: `S${offset + i + 1}` }));
  ctx.citations.push(...citations);
  const g: Grounding = { ...base, citations, sources: base.sources.map((s, i) => ({ ...s, id: `S${offset + i + 1}` })) };
  (ctx.groundings ??= []).push(g);
  return { ...g, label: groundingLabel(g) };
}

export async function basis(ctx: Ctx, query: string, limit = 4) {
  return attach(ctx, await cachedGround(query, limit));
}

/** Résumé compact renvoyé au modèle et à l'UI. */
export function basisData(g: Grounding & { label: string }) {
  return {
    statut: g.status,
    libelle: g.label,
    sources: g.sources.map((x) => ({ id: x.id, document: x.document, page: x.page, articles: x.articles, exemple_non_officiel: x.isExample })),
    consigne: g.status === "non_couvert" ? "Aucun texte du corpus ne couvre ce point : dis-le explicitement, n'invente aucune règle." : "Cite ces sources [Sx] pour tout point juridique.",
  };
}

/** Extrait le passage qui suit « Article N » dans un extrait ; à défaut, le début de l'extrait. */
export function articleExtract(excerpt: string, article: string, max = 320): string {
  const clean = excerpt.replace(/\s+/g, " ");
  const re = new RegExp(String.raw`ARTICLES?\s+(?:N[°º]\s*)?${article.replace(/\s+/g, "\\s*")}\b`, "i");
  const m = clean.match(re);
  const start = m?.index ?? 0;
  const out = clean.slice(start, start + max).trim();
  return out.length < clean.length - start ? `${out}…` : out;
}

/** Transforme un fondement en lignes « article par article » (sources officielles uniquement). */
export function articleRows(g: Grounding): ArticleRow[] {
  const rows: ArticleRow[] = [];
  for (const c of g.citations.filter((x) => !x.isExample)) {
    const doc = c.legalTitle ?? c.title;
    const arts = c.articles.length ? c.articles : getArticles(c.excerpt);
    if (!arts.length) rows.push({ source: c.id, document: doc, page: c.page, article: "—", extrait: articleExtract(c.excerpt, "__none__"), file: c.file });
    for (const a of arts.slice(0, 4)) rows.push({ source: c.id, document: doc, page: c.page, article: a, extrait: articleExtract(c.excerpt, a), file: c.file });
  }
  return rows;
}

export async function regulatoryTheme(ctx: Ctx, theme: string, query: string, limit = 3): Promise<RegulatoryTheme> {
  const g = await basis(ctx, query, limit);
  const rows = g.status === "non_couvert" ? [] : articleRows(g);
  return { theme, query, status: rows.length ? g.status : "non_couvert", label: rows.length ? g.label : "Non couvert par le corpus officiel", articles: rows };
}

/**
 * Droit du travail : le corpus officiel actuel (postes, télécoms, TIC, consommation, concurrence) ne contient pas
 * le Code du travail. On ne cite donc un texte que si un extrait officiel traite réellement de la relation de travail
 * (employeur, contrat de travail). Sinon : « non couvert par le corpus » — aucune règle inventée.
 */
const LABOUR_RE = /\bemployeurs?\b|contrat de travail/i;

export async function labourLaw(ctx: Ctx, topic: string) {
  const base = await cachedGround(`contrat de travail employeur ${topic}`, 4);
  const relevant = base.citations.filter((c) => !c.isExample && LABOUR_RE.test(c.excerpt));
  if (!relevant.length) {
    return {
      statut: "non_couvert" as const,
      libelle: "Droit du travail : non couvert par le corpus officiel",
      detail: "Le corpus officiel disponible ne contient pas le Code du travail ni de texte sur la relation employeur-salarié. Aucune règle (période d'essai, contrat, salaire minimum, non-discrimination) n'est affirmée : faites valider par un professionnel ou l'inspection du travail.",
      sources: [] as ArticleRow[],
    };
  }
  const g = attach(ctx, { ...base, citations: relevant, sources: base.sources.filter((s) => relevant.some((r) => r.id === s.id)) });
  return { statut: g.status, libelle: g.label, detail: "Extraits officiels traitant de la relation de travail.", sources: articleRows(g) };
}
