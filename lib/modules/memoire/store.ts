import { canAccessCompany } from "@/lib/workspace/access";
import { WorkspaceError, log } from "@/lib/workspace/service";
import { newId, nowIso, readData, withData } from "@/lib/workspace/store";
import type { Task, WorkspaceData } from "@/lib/workspace/types";
import type { Viewer } from "@/lib/workspace/access";
import type { Decision, LegalSnapshot, Meeting, MeetingAnalysis, MemoireData, SourceRef } from "./types";

/** Les données du module vivent dans `WorkspaceData.memoire` (champ optionnel, migration implicite). */
export function memo(data: WorkspaceData): MemoireData {
  if (!data.memoire) data.memoire = { decisions: [], meetings: [], attestations: [], seeded: [] };
  data.memoire.decisions ??= [];
  data.memoire.meetings ??= [];
  data.memoire.attestations ??= [];
  data.memoire.seeded ??= [];
  return data.memoire;
}

export function readMemo(data: WorkspaceData): MemoireData {
  return data.memoire ?? { decisions: [], meetings: [], attestations: [], seeded: [] };
}

type Kind = "decisions" | "meetings" | "attestations";
const LABELS: Record<Kind, string> = { decisions: "Décision", meetings: "Réunion", attestations: "Attestation" };

/** Contrôle d'appartenance d'un objet du module (même règle que lib/workspace/access.ts). */
export async function assertMemoireAccess(kind: Kind, id: string, viewer: Viewer): Promise<string> {
  const data = await readData();
  const item = (readMemo(data)[kind] as { id: string; companyId: string }[]).find((x) => x.id === id);
  if (!item || !canAccessCompany(data, item.companyId, viewer.email)) throw new WorkspaceError(`${LABELS[kind]} introuvable.`, 404);
  return item.companyId;
}

export async function assertMemoireInCompany(kind: Kind, id: string, companyId: string) {
  const data = await readData();
  const item = (readMemo(data)[kind] as { id: string; companyId: string }[]).find((x) => x.id === id);
  if (!item || item.companyId !== companyId) throw new WorkspaceError(`${LABELS[kind]} introuvable dans cette entreprise.`, 404);
}

export type NewDecision = {
  title: string;
  decision: string;
  rationale?: string;
  alternatives?: string[];
  status?: Decision["status"];
  decidedBy?: string;
  decidedAt?: string;
  sources?: SourceRef[];
  meetingId?: string;
  tags?: string[];
  isExample?: boolean;
};

/** Ajoute une décision (mutation synchrone, l'instantané juridique est calculé AVANT par l'appelant). */
export function insertDecision(data: WorkspaceData, companyId: string, input: NewDecision, legal: LegalSnapshot, actor: string): Decision {
  const t = nowIso();
  const d: Decision = {
    id: newId("dec"),
    companyId,
    title: input.title.trim().slice(0, 200),
    decision: input.decision.trim().slice(0, 2000),
    rationale: (input.rationale ?? "").trim().slice(0, 3000),
    alternatives: (input.alternatives ?? []).map((a) => a.trim()).filter(Boolean).slice(0, 10),
    status: input.status ?? "adoptee",
    decidedAt: input.decidedAt ?? t,
    decidedBy: input.decidedBy ?? actor,
    sources: input.sources ?? [],
    legal,
    meetingId: input.meetingId,
    taskIds: [],
    tags: input.tags ?? [],
    isExample: input.isExample,
    createdAt: t,
    updatedAt: t,
  };
  memo(data).decisions.unshift(d);
  log(data, companyId, actor, "decision.enregistrement", `Décision « ${d.title} » (${d.status}) — ${legal.label}.`);
  return d;
}

/**
 * Applique l'analyse d'une réunion : décisions au registre (avec leur instantané juridique), tâches assignées
 * et journal. Idempotent : une réunion déjà terminée n'est pas ré-appliquée.
 */
export function applyAnalysis(data: WorkspaceData, meeting: Meeting, analysis: MeetingAnalysis, legal: LegalSnapshot[], actor: string) {
  if (meeting.status === "terminee" && meeting.decisionIds.length + meeting.taskIds.length > 0) throw new WorkspaceError("Réunion déjà clôturée et analysée.", 409);
  meeting.analysis = analysis;
  meeting.status = "terminee";
  meeting.updatedAt = nowIso();
  const ref: SourceRef = { type: "reunion", id: meeting.id, label: `Réunion « ${meeting.title} » du ${meeting.date.slice(0, 10)}` };
  analysis.decisions.forEach((dec, i) => {
    const d = insertDecision(
      data,
      meeting.companyId,
      { title: dec.title, decision: dec.title, rationale: dec.rationale, status: "adoptee", decidedAt: meeting.date, decidedBy: meeting.participants.join(", ") || actor, sources: [ref], meetingId: meeting.id, isExample: meeting.isExample },
      legal[i] ?? { query: dec.title, status: "non_couvert", label: "Non couvert par le corpus officiel", capturedAt: nowIso(), sources: [] },
      actor,
    );
    meeting.decisionIds.push(d.id);
  });
  for (const action of analysis.actions) {
    const task: Task = {
      id: newId("tsk"),
      companyId: meeting.companyId,
      title: action.title,
      description: `Issue de la réunion « ${meeting.title} » (${meeting.date.slice(0, 10)})${action.assigneeName ? ` — assignée à ${action.assigneeName}` : ""}.`,
      dueDate: action.dueDate ? new Date(`${action.dueDate}T17:00:00`).toISOString() : undefined,
      status: "a_faire",
      source: "agent",
      assigneeId: action.assigneeId,
      createdAt: nowIso(),
    };
    data.tasks.push(task);
    action.taskId = task.id;
    meeting.taskIds.push(task.id);
    log(data, meeting.companyId, actor, "tache.creation", `Tâche « ${task.title} »${action.assigneeName ? ` assignée à ${action.assigneeName}` : ""}${task.dueDate ? ` (échéance ${task.dueDate.slice(0, 10)})` : ""} — réunion « ${meeting.title} ».`);
  }
  // Rattache les tâches aux décisions de la même réunion (suivi des engagements).
  for (const id of meeting.decisionIds) {
    const d = memo(data).decisions.find((x) => x.id === id);
    if (d) d.taskIds = [...meeting.taskIds];
  }
  log(data, meeting.companyId, actor, "reunion.analyse", `Réunion « ${meeting.title} » : ${analysis.decisions.length} décision(s), ${analysis.actions.length} tâche(s) créée(s) (${analysis.mode === "llm" ? "IA" : "démo"}).`);
}

export async function withMemo<T>(fn: (data: WorkspaceData, m: MemoireData) => T | Promise<T>) {
  return withData((data) => fn(data, memo(data)));
}
