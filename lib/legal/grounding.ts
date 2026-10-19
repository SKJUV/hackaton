import { terms } from "@/lib/documents";
import type { Citation } from "./citations";
import { searchLegalCorpus } from "./corpus";

/**
 * Ancrage juridique : chaque conseil ou action du co-fondateur commence par une recherche
 * dans le corpus officiel. On mesure si les extraits trouvés couvrent réellement la question
 * (part des termes significatifs présents dans le meilleur extrait officiel) afin de pouvoir dire
 * honnêtement « fondé sur le texte X » ou « non couvert par le corpus ».
 */
export type GroundingStatus = "fonde" | "partiel" | "non_couvert";

export type GroundingSource = { id: string; document: string; page: number; articles: string[]; file: string; isExample: boolean };

export type Grounding = {
  query: string;
  status: GroundingStatus;
  /** Part (0–1) des termes de la question retrouvés dans le meilleur extrait officiel. */
  coverage: number;
  matchedTerms: string[];
  sources: GroundingSource[];
  citations: Citation[];
  indexReady: boolean;
};

/** Mots trop génériques pour prouver qu'un texte couvre la question. */
const GENERIC = new Set([
  "entreprise", "entreprises", "societe", "societes", "cameroun", "camerounais", "camerounaise", "loi", "lois", "article", "articles",
  "texte", "textes", "juridique", "juridiques", "droit", "comment", "quelles", "quels", "quelle", "quel", "faire", "faut", "dois", "doit",
  "peux", "peut", "mon", "ma", "mes", "notre", "nos", "votre", "vos", "une", "des", "les", "pour", "avec", "dans", "sur", "par", "est",
  "sont", "plan", "projet", "besoin", "demande", "trouve", "trouver", "aide", "aider", "creer", "mettre", "jour", "liste", "lister",
  "devenir", "obtenir", "avoir", "etre", "ouvrir", "lancer", "monter", "demarrer", "quoi", "pourquoi", "combien", "quand", "cela",
  "ceci", "veux", "voudrais", "souhaite", "merci", "bonjour", "svp", "stp", "genere", "generer", "redige", "rediger", "prepare", "preparer",
]);

const stem = (t: string) => t.slice(0, 6);

export function significantTerms(question: string): string[] {
  return [...new Set(terms(question).filter((t) => t.length >= 4 && !GENERIC.has(t) && !/^\d+$/.test(t)))];
}

/** Calcule la couverture d'une question par un ensemble de textes officiels (pur, testable). */
export function assessCoverage(question: string, officialTexts: string[]): { status: GroundingStatus; coverage: number; matchedTerms: string[] } {
  const wanted = significantTerms(question);
  if (!wanted.length || !officialTexts.length) return { status: "non_couvert", coverage: 0, matchedTerms: [] };
  let best: string[] = [];
  for (const text of officialTexts) {
    const present = new Set(terms(text).map(stem));
    const matched = wanted.filter((w) => present.has(stem(w)));
    if (matched.length > best.length) best = matched;
  }
  const coverage = best.length / wanted.length;
  const enough = best.length >= Math.min(2, wanted.length);
  const status: GroundingStatus = coverage >= 0.8 && enough ? "fonde" : coverage >= 0.34 && best.length >= Math.min(2, wanted.length) ? "partiel" : "non_couvert";
  return { status, coverage: Math.round(coverage * 100) / 100, matchedTerms: best };
}

export function toSource(c: Citation): GroundingSource {
  return { id: c.id, document: c.legalTitle ?? c.title, page: c.page, articles: c.articles, file: c.file, isExample: Boolean(c.isExample) };
}

export async function groundQuery(question: string, limit = 4): Promise<Grounding> {
  const search = await searchLegalCorpus(question, limit);
  const official = search.citations.filter((c) => !c.isExample);
  const assessed = assessCoverage(question, official.map((c) => c.excerpt));
  return {
    query: question,
    ...assessed,
    sources: search.citations.map(toSource),
    citations: search.citations,
    indexReady: search.indexReady,
  };
}

/** Libellé court affiché dans l'UI et repris dans les documents générés. */
export function groundingLabel(g: Pick<Grounding, "status" | "sources">): string {
  const off = g.sources.filter((s) => !s.isExample);
  if (g.status === "non_couvert" || !off.length) return "Non couvert par le corpus officiel";
  const first = off[0];
  const ref = `${first.document}, p. ${first.page}${first.articles.length ? `, art. ${first.articles.slice(0, 2).join(", ")}` : ""}`;
  return g.status === "fonde" ? `Fondé sur : ${ref}` : `Partiellement couvert : ${ref}`;
}

/** Section Markdown « Fondement juridique » à ajouter aux documents générés. */
export function groundingMarkdown(g: Grounding): string {
  const off = g.sources.filter((s) => !s.isExample);
  const ex = g.sources.filter((s) => s.isExample);
  const lines = ["", "## Fondement juridique (corpus officiel)", ""];
  if (g.status === "non_couvert" || !off.length) {
    lines.push(
      `> ⚠️ **Non couvert par le corpus officiel** pour « ${g.query} ». Aucune règle n'est inventée ici : faites vérifier ce point par un professionnel ou l'administration compétente.`,
    );
  } else {
    if (g.status === "partiel") lines.push("> Couverture partielle : seuls certains aspects sont traités par les textes ci-dessous.", "");
    for (const s of off) lines.push(`- [${s.id}] ${s.document} — page ${s.page}${s.articles.length ? `, art. ${s.articles.slice(0, 4).join(", ")}` : ""}`);
  }
  for (const s of ex) lines.push(`- [${s.id}] ⚠️ Texte d'EXEMPLE, non officiel — ${s.document}`);
  lines.push("", "_Trame générée automatiquement : à faire valider par un professionnel du droit._");
  return lines.join("\n");
}
