import type { ChecklistStep, Obligation, WorkspaceDocument } from "@/lib/workspace/types";

export type ComplianceScore = {
  score: number;
  level: "critique" | "a_ameliorer" | "bon" | "excellent";
  breakdown: { label: string; points: number; max: number; detail: string }[];
  recommendations: string[];
};

/**
 * Score de conformité (0–100) :
 *  - 50 pts : avancement des démarches de création
 *  - 30 pts : obligations du calendrier (pénalité pour retard)
 *  - 20 pts : documents fondateurs présents (statuts, business plan, contrats)
 */
export function computeCompliance(
  checklist: ChecklistStep[],
  obligations: Obligation[],
  documents: WorkspaceDocument[],
  now = new Date(),
): ComplianceScore {
  const done = checklist.filter((s) => s.status === "fait").length;
  const blocked = checklist.filter((s) => s.status === "bloque");
  const stepPoints = checklist.length ? Math.round((done / checklist.length) * 50) : 0;

  const overdue = obligations.filter((o) => !o.done && new Date(o.dueDate) < now);
  const soon = obligations.filter((o) => !o.done && new Date(o.dueDate) >= now && new Date(o.dueDate).getTime() - now.getTime() < 14 * 86400000);
  const obligationPoints = Math.max(0, 30 - overdue.length * 10 - soon.length * 2);

  const kinds = new Set(documents.map((d) => d.kind));
  const expected: { kind: WorkspaceDocument["kind"]; label: string }[] = [
    { kind: "statuts", label: "statuts" },
    { kind: "business_plan", label: "business plan" },
    { kind: "contrat", label: "au moins un contrat type" },
    { kind: "roadmap", label: "roadmap" },
  ];
  const presentDocs = expected.filter((e) => kinds.has(e.kind));
  const docPoints = presentDocs.length * 5;

  const score = stepPoints + obligationPoints + docPoints;
  const recommendations: string[] = [];
  const next = checklist.filter((s) => s.status !== "fait").sort((a, b) => a.order - b.order)[0];
  if (next) recommendations.push(`Prochaine démarche : « ${next.title} » (${next.authority}).`);
  for (const step of blocked) recommendations.push(`Débloquer la démarche « ${step.title} »${step.note ? ` : ${step.note}` : ""}.`);
  for (const o of overdue) recommendations.push(`Obligation en retard : ${o.title}.`);
  for (const o of soon) recommendations.push(`Échéance sous 14 jours : ${o.title} (${new Date(o.dueDate).toLocaleDateString("fr-FR")}).`);
  for (const e of expected.filter((x) => !kinds.has(x.kind))) recommendations.push(`Générer le document manquant : ${e.label}.`);

  return {
    score,
    level: score >= 85 ? "excellent" : score >= 65 ? "bon" : score >= 40 ? "a_ameliorer" : "critique",
    breakdown: [
      { label: "Démarches de création", points: stepPoints, max: 50, detail: `${done}/${checklist.length} étapes terminées` },
      { label: "Obligations à jour", points: obligationPoints, max: 30, detail: `${overdue.length} en retard, ${soon.length} sous 14 j` },
      { label: "Documents fondateurs", points: docPoints, max: 20, detail: `${presentDocs.length}/${expected.length} présents` },
    ],
    recommendations,
  };
}

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type WatchAlert = { source: string; title: string; category: string; matched: string[]; relevance: number; isNewOfficial: boolean };

/** Veille réglementaire : croise les mots-clés sectoriels de l'entreprise avec le corpus officiel. */
export function regulatoryWatch(
  keywords: string[],
  documents: { source: string; title: string; category: string; sample: string }[],
  limit = 8,
): WatchAlert[] {
  const kws = keywords.map(normalize).filter(Boolean);
  return documents
    .map((doc) => {
      const hay = normalize(`${doc.title} ${doc.category} ${doc.sample}`);
      const matched = kws.filter((k) => hay.includes(k));
      const hits = matched.reduce((sum, k) => sum + (hay.split(k).length - 1), 0);
      const primary = /^reglementation\/(lois|decret|décret|arrete|decision)/i.test(doc.source) || doc.source.startsWith("corpus/officiel");
      return {
        source: doc.source,
        title: doc.title,
        category: doc.category,
        matched,
        relevance: matched.length * 10 + Math.min(Math.round(Math.sqrt(hits) * 4), 40) + (primary ? 25 : 0) - (doc.source.startsWith("publications/") ? 15 : 0),
        isNewOfficial: doc.source.startsWith("corpus/officiel"),
      };
    })
    .filter((a) => a.matched.length > 0 && a.relevance > 0)
    .filter((a, i, all) => all.findIndex((b) => b.title.replace(/\s*copie\s*/gi, "").trim() === a.title.replace(/\s*copie\s*/gi, "").trim()) === i)
    .sort((a, b) => Number(b.isNewOfficial) - Number(a.isNewOfficial) || b.relevance - a.relevance)
    .slice(0, limit);
}
