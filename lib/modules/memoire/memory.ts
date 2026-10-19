import { terms } from "@/lib/documents";
import { WorkspaceError, log } from "@/lib/workspace/service";
import { nowIso, readData } from "@/lib/workspace/store";
import type { WorkspaceData } from "@/lib/workspace/types";
import { snapshotLegal, snapshotLines } from "./legal";
import { completeText } from "./llm";
import { ensureMemoireSeed } from "./seed";
import { insertDecision, readMemo, withMemo, type NewDecision } from "./store";
import type { Decision, DecisionStatus, LegalSnapshot, SourceRef } from "./types";

/**
 * Mémoire organisationnelle : index lexical (BM25 simplifié) de TOUT ce qui appartient à une entreprise —
 * décisions, documents, emails, réunions, journal d'audit et conversations avec l'agent.
 * Les réponses citent les éléments sources [M1], [M2]… et, pour les décisions, les textes juridiques
 * consultés AU MOMENT de la décision (instantané figé).
 */

export type MemoryItem = { ref: SourceRef; date: string; title: string; text: string; decision?: Decision; isExample?: boolean };
export type MemoryHit = { id: string; ref: SourceRef; date: string; title: string; excerpt: string; score: number; isExample?: boolean };

export function buildMemoryIndex(data: WorkspaceData, companyId: string): MemoryItem[] {
  const by = <T extends { companyId: string }>(list: T[]) => list.filter((x) => x.companyId === companyId);
  const m = readMemo(data);
  const items: MemoryItem[] = [];
  for (const d of by(m.decisions)) {
    items.push({
      ref: { type: "decision", id: d.id, label: `Décision « ${d.title} »` },
      date: d.decidedAt,
      title: d.title,
      text: [d.title, d.decision, d.rationale, d.alternatives.join(" "), d.tags.join(" "), d.legal.sources.map((s) => `${s.document} ${s.articles.join(" ")}`).join(" ")].join("\n"),
      decision: d,
      isExample: d.isExample,
    });
  }
  for (const r of by(m.meetings)) {
    items.push({ ref: { type: "reunion", id: r.id, label: `Réunion « ${r.title} » du ${r.date.slice(0, 10)}` }, date: r.date, title: r.title, text: `${r.title}\n${r.analysis?.summary ?? ""}\n${r.transcript}`, isExample: r.isExample });
  }
  for (const doc of by(data.documents)) {
    items.push({ ref: { type: "document", id: doc.id, label: `Document « ${doc.title} »` }, date: doc.updatedAt, title: doc.title, text: `${doc.title}\n${doc.content}` });
  }
  for (const e of by(data.emails)) {
    items.push({ ref: { type: "email", id: e.id, label: `Email « ${e.subject} » → ${e.to.join(", ")}` }, date: e.sentAt ?? e.createdAt, title: e.subject, text: `${e.subject}\n${e.to.join(" ")}\n${e.body}` });
  }
  for (const a of by(data.activity)) {
    items.push({ ref: { type: "journal", id: a.id, label: `Journal : ${a.action}` }, date: a.createdAt, title: a.action, text: `${a.action.replace(/[._]/g, " ")}\n${a.details}` });
  }
  for (const msg of by(data.messages)) {
    items.push({ ref: { type: "message", id: msg.id, label: `Conversation agent (${msg.role === "user" ? "question" : "réponse"})` }, date: msg.createdAt, title: msg.content.slice(0, 80), text: msg.content });
  }
  return items;
}

/** Synonymes métier : « structure juridique » ≈ « forme sociale », etc. */
const SYNONYMS: Record<string, string[]> = {
  structure: ["forme", "sarl", "sas", "societe"],
  forme: ["structure", "sarl", "sas"],
  statut: ["forme", "statuts"],
  juridique: ["forme", "sarl", "sas"],
  choisi: ["decide", "retenu", "choix"],
  choix: ["decide", "retenu", "choisi"],
  decide: ["choisi", "retenu", "decision"],
  paiement: ["encaissement", "mobile", "money"],
  fournisseur: ["devis", "fournisseurs"],
  activite: ["livraison", "colis"],
};
const stem = (t: string) => t.slice(0, 5);
const WHY = /\b(pourquoi|raison|motif|decide|decision|choisi|choix|opte|retenu)/;

export function queryTerms(question: string): string[] {
  const base = terms(question).filter((t) => t.length >= 3);
  const extra = base.flatMap((t) => SYNONYMS[t] ?? SYNONYMS[t.replace(/s$/, "")] ?? []);
  return [...new Set([...base, ...extra].map(stem))];
}

export function searchMemory(items: MemoryItem[], question: string, limit = 6): MemoryHit[] {
  const q = queryTerms(question);
  if (!q.length || !items.length) return [];
  const docs = items.map((it) => ({ it, toks: terms(it.text).map(stem), title: new Set(terms(it.title).map(stem)) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d.toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = docs.reduce((s, d) => s + d.toks.length, 0) / docs.length || 1;
  const why = WHY.test(question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  const scored = docs.map(({ it, toks, title }) => {
    let score = 0;
    let matched = 0;
    for (const t of q) {
      const tf = toks.filter((x) => x === t).length;
      if (!tf) continue;
      matched += 1;
      const idf = Math.log(1 + (docs.length - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += idf * ((tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (toks.length / avg))));
      if (title.has(t)) score += idf * 0.8;
    }
    if (!matched) return { it, score: 0 };
    score *= 0.6 + 0.4 * (matched / q.length);
    if (it.ref.type === "decision") score *= why ? 1.8 : 1.2;
    if (it.ref.type === "journal") score *= 0.6;
    return { it, score };
  });
  return scored
    .filter((s) => s.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s, i) => ({ id: `M${i + 1}`, ref: s.it.ref, date: s.it.date, title: s.it.title, excerpt: excerptFor(s.it.text, q), score: Math.round(s.score * 100) / 100, isExample: s.it.isExample }));
}

function excerptFor(text: string, q: string[]): string {
  const lines = text.split(/\n+/).filter((l) => l.trim());
  const best = lines.map((l) => ({ l, n: terms(l).map(stem).filter((t) => q.includes(t)).length })).sort((a, b) => b.n - a.n)[0]?.l ?? text;
  const clean = best.replace(/\s+/g, " ").trim();
  return clean.length > 260 ? `${clean.slice(0, 257)}…` : clean;
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala", day: "2-digit", month: "long", year: "numeric" });
export const STATUS_LABEL: Record<DecisionStatus, string> = { proposee: "proposée", adoptee: "adoptée", revisee: "révisée", abandonnee: "abandonnée" };

export function decisionMarkdown(d: Decision, sourceIds: string[] = []): string {
  return [
    `**${d.title}** — décision ${STATUS_LABEL[d.status]} le ${fmt(d.decidedAt)} par ${d.decidedBy}${d.isExample ? " _(exemple de démonstration)_" : ""}.`,
    `- Décision : ${d.decision}`,
    `- Raisons consignées : ${d.rationale || "aucune motivation n'a été consignée."}`,
    d.alternatives.length ? `- Alternatives écartées : ${d.alternatives.join(" ; ")}` : "",
    `- Textes consultés au moment de la décision (${fmt(d.legal.capturedAt)}) — ${d.legal.label}${d.legal.status === "partiel" ? " (couverture partielle : pertinence à vérifier)" : ""} :\n${snapshotLines(d.legal).map((l) => `  - ${l}`).join("\n")}`,
    d.sources.length ? `- Éléments sources : ${d.sources.map((s) => s.label).join(" ; ")}${sourceIds.length ? ` [${sourceIds.join("][")}]` : ""}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type MemoryAnswer = { question: string; answer: string; mode: "llm" | "demo"; provider?: string; hits: MemoryHit[]; decisions: Decision[] };

/** Réponse extractive (sans IA) : jamais d'invention, uniquement ce qui est consigné. */
export function extractiveAnswer(question: string, hits: MemoryHit[], decisions: Decision[]): string {
  if (!hits.length) return "Je ne trouve rien dans la mémoire de l'entreprise sur ce sujet (décisions, documents, emails, réunions, journal). Enregistrez la décision ou la réunion concernée pour qu'elle soit retrouvable.";
  const out: string[] = [];
  const mainDecision = decisions[0];
  if (mainDecision) {
    const ids = hits.filter((h) => mainDecision.sources.some((s) => s.id === h.ref.id) || h.ref.id === mainDecision.id).map((h) => h.id);
    out.push(`D'après le **registre des décisions** :\n${decisionMarkdown(mainDecision, ids)}`);
  }
  const others = hits.filter((h) => h.ref.id !== mainDecision?.id).slice(0, 4);
  if (others.length) out.push(`${mainDecision ? "Autres éléments liés" : "Éléments trouvés dans la mémoire"} :\n${others.map((h) => `- [${h.id}] ${h.ref.label} (${fmt(h.date)}) : « ${h.excerpt} »`).join("\n")}`);
  return out.join("\n\n");
}

export async function askMemory(companyId: string, question: string, opts: { llm?: boolean } = {}): Promise<MemoryAnswer> {
  const q = question.trim();
  if (q.length < 3) throw new WorkspaceError("Question trop courte.");
  await ensureMemoireSeed(companyId);
  const data = await readData();
  if (!data.companies.some((c) => c.id === companyId)) throw new WorkspaceError("Entreprise introuvable.", 404);
  const hits = searchMemory(buildMemoryIndex(data, companyId), q);
  const all = readMemo(data).decisions;
  const decisions = hits.filter((h) => h.ref.type === "decision").map((h) => all.find((d) => d.id === h.ref.id)!).filter(Boolean);
  const fallback = extractiveAnswer(q, hits, decisions);
  if (opts.llm !== false && hits.length) {
    const context = {
      elements: hits.map((h) => ({ id: h.id, type: h.ref.type, libelle: h.ref.label, date: h.date.slice(0, 10), extrait: h.excerpt, exemple: h.isExample ?? false })),
      decisions: decisions.map((d) => ({ titre: d.title, statut: d.status, date: d.decidedAt.slice(0, 10), par: d.decidedBy, decision: d.decision, raisons: d.rationale, alternatives: d.alternatives, textes_au_moment_de_la_decision: snapshotLines(d.legal) })),
    };
    const llm = await completeText(
      "Tu es la mémoire organisationnelle de l'entreprise. Réponds en français, de façon concise, UNIQUEMENT à partir des éléments fournis. Cite les éléments [M1], [M2]… Pour les textes de loi, cite seulement ceux listés dans « textes_au_moment_de_la_decision » (document, page, articles) ; s'ils indiquent « non couvert », dis-le. N'invente ni fait, ni article, ni chiffre. Si la réponse n'est pas dans les éléments, dis-le.",
      `Question : ${q}\n\nÉléments :\n${JSON.stringify(context)}`,
      900,
    );
    if (llm) return { question: q, answer: llm.text, mode: "llm", provider: llm.provider, hits, decisions };
  }
  return { question: q, answer: fallback, mode: "demo", hits, decisions };
}

export async function recordDecision(companyId: string, input: NewDecision, actor = "utilisateur", precomputed?: LegalSnapshot): Promise<Decision> {
  if (!input.title?.trim() || !input.decision?.trim()) throw new WorkspaceError("Titre et décision requis.");
  const legal = precomputed ?? await snapshotLegal(`${input.title} ${input.decision} ${input.tags?.join(" ") ?? ""}`.slice(0, 400));
  return withMemo((data) => {
    if (!data.companies.some((c) => c.id === companyId)) throw new WorkspaceError("Entreprise introuvable.", 404);
    return insertDecision(data, companyId, input, legal, actor);
  });
}

export async function updateDecision(decisionId: string, patch: { status?: DecisionStatus; note?: string }, actor = "utilisateur") {
  return withMemo((data, m) => {
    const d = m.decisions.find((x) => x.id === decisionId);
    if (!d) throw new WorkspaceError("Décision introuvable.", 404);
    if (patch.status && !(patch.status in STATUS_LABEL)) throw new WorkspaceError("Statut invalide.");
    if (patch.status) d.status = patch.status;
    if (patch.note?.trim()) d.rationale = `${d.rationale}${d.rationale ? "\n" : ""}[${new Date().toISOString().slice(0, 10)}] ${patch.note.trim()}`;
    d.updatedAt = nowIso();
    log(data, d.companyId, actor, "decision.mise_a_jour", `Décision « ${d.title} » → ${STATUS_LABEL[d.status]}${patch.note ? ` (${patch.note.trim().slice(0, 120)})` : ""}.`);
    return d;
  });
}

export async function listDecisions(companyId: string, filter: { status?: string; q?: string } = {}) {
  await ensureMemoireSeed(companyId);
  const data = await readData();
  let list = readMemo(data).decisions.filter((d) => d.companyId === companyId);
  if (filter.status) list = list.filter((d) => d.status === filter.status);
  if (filter.q?.trim()) {
    const ids = new Set(searchMemory(buildMemoryIndex(data, companyId).filter((i) => i.ref.type === "decision"), filter.q, 50).map((h) => h.ref.id));
    list = list.filter((d) => ids.has(d.id));
  }
  return list.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
}
