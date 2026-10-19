import { WorkspaceError, log } from "@/lib/workspace/service";
import { newId, nowIso, readData } from "@/lib/workspace/store";
import type { Member, WorkspaceDocument } from "@/lib/workspace/types";
import { analyzeTranscriptDemo, joinIndex, parseDueDate, parseTranscript, type Person } from "./analyze";
import { snapshotLegal, snapshotLines } from "./legal";
import { completeText, parseJsonObject } from "./llm";
import { ensureMemoireSeed } from "./seed";
import { applyAnalysis, readMemo, withMemo } from "./store";
import type { Decision, LegalSnapshot, Meeting, MeetingAnalysis } from "./types";

/** Salle de réunion intelligente : saisie (texte, dictée, audio transcrit), analyse, tâches, PV. */

const MAX_TRANSCRIPT = 60_000;

function people(members: Member[], participants: string[]): Person[] {
  const list: Person[] = members.map((m) => ({ id: m.id, name: m.name }));
  for (const p of participants) if (!list.some((x) => x.name === p)) list.push({ name: p });
  return list;
}

export async function createMeeting(
  companyId: string,
  input: { title: string; transcript?: string; participants?: string[]; date?: string; source?: Meeting["source"]; transcription?: Meeting["transcription"] },
  actor = "utilisateur",
): Promise<Meeting> {
  if (!input.title?.trim()) throw new WorkspaceError("Titre de réunion requis.");
  if ((input.transcript ?? "").length > MAX_TRANSCRIPT) throw new WorkspaceError("Transcription trop longue (60 000 caractères max).");
  return withMemo((data, m) => {
    if (!data.companies.some((c) => c.id === companyId)) throw new WorkspaceError("Entreprise introuvable.", 404);
    const t = nowIso();
    const meeting: Meeting = {
      id: newId("reu"),
      companyId,
      title: input.title.trim().slice(0, 160),
      date: input.date && !Number.isNaN(Date.parse(input.date)) ? new Date(input.date).toISOString() : t,
      participants: (input.participants ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 30),
      transcript: (input.transcript ?? "").trim(),
      source: input.source ?? "texte",
      transcription: input.transcription,
      status: "en_cours",
      decisionIds: [],
      taskIds: [],
      createdBy: actor,
      createdAt: t,
      updatedAt: t,
    };
    m.meetings.unshift(meeting);
    log(data, companyId, actor, "reunion.ouverture", `Réunion « ${meeting.title} » ouverte (${meeting.source}).`);
    return meeting;
  });
}

/** Ajout en direct (dictée, prise de notes) pendant une réunion en cours. */
export async function appendToMeeting(meetingId: string, text: string, speaker?: string) {
  const line = text.trim();
  if (!line) throw new WorkspaceError("Texte vide.");
  return withMemo((_data, m) => {
    const meeting = m.meetings.find((x) => x.id === meetingId);
    if (!meeting) throw new WorkspaceError("Réunion introuvable.", 404);
    if (meeting.status !== "en_cours") throw new WorkspaceError("La réunion est clôturée.", 409);
    const elapsed = Math.max(0, Math.round((Date.now() - Date.parse(meeting.createdAt)) / 1000));
    const stamp = `[${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}]`;
    const add = line.split(/\r?\n/).map((l) => (/^\s*\[?\d{1,2}:\d{2}/.test(l) ? l : `${stamp} ${speaker ? `${speaker} : ` : ""}${l}`)).join("\n");
    meeting.transcript = `${meeting.transcript}${meeting.transcript ? "\n" : ""}${add}`.slice(0, MAX_TRANSCRIPT);
    meeting.updatedAt = nowIso();
    return meeting;
  });
}

type LlmAnalysis = { resume?: string; points_cles?: string[]; decisions?: { titre?: string; raisons?: string }[]; actions?: { titre?: string; responsable?: string; echeance?: string }[] };

/** Analyse IA si une clé est configurée (même structure que le mode démo), sinon règles déterministes. */
export async function analyzeTranscript(transcript: string, persons: Person[], base = new Date()): Promise<MeetingAnalysis> {
  const demo = analyzeTranscriptDemo(transcript, persons, base);
  if (!transcript.trim()) return demo;
  const llm = await completeText(
    `Tu es le secrétaire de séance. Analyse la transcription et renvoie UNIQUEMENT un objet JSON :
{"resume": string (3 phrases max), "points_cles": string[], "decisions": [{"titre": string, "raisons": string}], "actions": [{"titre": string, "responsable": string|null, "echeance": "AAAA-MM-JJ"|null}]}
N'invente rien : uniquement ce qui est dit. Participants connus : ${persons.map((p) => p.name).join(", ")}. Date de la réunion : ${base.toISOString().slice(0, 10)}.`,
    transcript.slice(0, 24_000),
    1800,
  );
  const parsed = llm ? parseJsonObject<LlmAnalysis>(llm.text) : null;
  if (!llm || !parsed || !Array.isArray(parsed.decisions) || !Array.isArray(parsed.actions)) return demo;
  const match = (name?: string | null) => {
    if (!name) return undefined;
    const n = name.toLowerCase();
    return persons.find((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase().split(" ")[0]));
  };
  return {
    summary: String(parsed.resume ?? demo.summary).slice(0, 1200),
    keyPoints: (parsed.points_cles ?? []).map(String).slice(0, 8),
    decisions: parsed.decisions.filter((d) => d.titre).map((d) => ({ title: String(d.titre).slice(0, 160), rationale: String(d.raisons ?? "").slice(0, 600) })),
    actions: parsed.actions.filter((a) => a.titre).map((a) => {
      const who = match(a.responsable);
      const due = a.echeance && /^\d{4}-\d{2}-\d{2}$/.test(a.echeance) ? a.echeance : parseDueDate(String(a.titre), base);
      return { title: String(a.titre).slice(0, 140), assigneeId: who?.id, assigneeName: who?.name ?? (a.responsable || undefined), dueDate: due };
    }),
    mode: "llm",
    provider: llm.provider,
  };
}

async function loadMeeting(meetingId: string) {
  const data = await readData();
  const meeting = readMemo(data).meetings.find((x) => x.id === meetingId);
  if (!meeting) throw new WorkspaceError("Réunion introuvable.", 404);
  return { data, meeting };
}

/** Aperçu (aucune écriture) ou clôture : décisions au registre + tâches assignées + journal. */
export async function analyzeMeeting(meetingId: string, opts: { finalize: boolean }, actor = "utilisateur") {
  const { data, meeting } = await loadMeeting(meetingId);
  const persons = people(data.members.filter((x) => x.companyId === meeting.companyId), meeting.participants);
  const analysis = await analyzeTranscript(meeting.transcript, persons, new Date(meeting.date));
  if (!opts.finalize) return { meeting, analysis, preview: true };
  const legal: LegalSnapshot[] = [];
  for (const d of analysis.decisions) legal.push(await snapshotLegal(`${d.title} ${d.rationale}`.slice(0, 300)));
  const saved = await withMemo((d, m) => {
    const live = m.meetings.find((x) => x.id === meetingId)!;
    applyAnalysis(d, live, analysis, legal, actor);
    return live;
  });
  return { meeting: saved, analysis, preview: false };
}

/** Raccourci : crée la réunion et l'analyse immédiatement (transcription complète). */
export async function recordMeeting(companyId: string, input: Parameters<typeof createMeeting>[1], actor = "utilisateur") {
  if (!input.transcript?.trim()) throw new WorkspaceError("Transcription requise.");
  const meeting = await createMeeting(companyId, input, actor);
  return analyzeMeeting(meeting.id, { finalize: true }, actor);
}

export type Missed = { meetingId?: string; since?: string; summary: string; decisions: string[]; actions: { title: string; assignee?: string; dueDate?: string }[]; keyPoints: string[]; items: { label: string; date: string }[]; mode: "llm" | "demo" };

/**
 * « Ce que j'ai manqué ».
 * - Avec une réunion : tout ce qui a été dit AVANT l'arrivée du membre (horodatage mm:ss, n° de ligne ou %).
 * - Sans réunion : ce qui s'est passé dans l'entreprise depuis une date (décisions, réunions, tâches, approbations).
 */
export async function whatIMissed(companyId: string, opts: { meetingId?: string; since?: string; memberId?: string }): Promise<Missed> {
  await ensureMemoireSeed(companyId);
  const data = await readData();
  const m = readMemo(data);
  if (opts.meetingId) {
    const meeting = m.meetings.find((x) => x.id === opts.meetingId && x.companyId === companyId);
    if (!meeting) throw new WorkspaceError("Réunion introuvable.", 404);
    const lines = parseTranscript(meeting.transcript);
    const cut = joinIndex(lines, opts.since);
    const before = lines.slice(0, cut).map((l) => `${l.time ? `[${l.time}] ` : ""}${l.speaker ? `${l.speaker} : ` : ""}${l.text}`).join("\n");
    const persons = people(data.members.filter((x) => x.companyId === companyId), meeting.participants);
    const a = await analyzeTranscript(before, persons, new Date(meeting.date));
    return {
      meetingId: meeting.id,
      since: opts.since,
      summary: cut === 0 ? "Vous n'avez rien manqué : la réunion commençait." : `Avant votre arrivée (${cut} intervention(s) sur ${lines.length}) : ${a.summary}`,
      decisions: a.decisions.map((d) => d.title),
      actions: a.actions.map((x) => ({ title: x.title, assignee: x.assigneeName, dueDate: x.dueDate })),
      keyPoints: a.keyPoints,
      items: [],
      mode: a.mode,
    };
  }
  const sinceDate = opts.since && !Number.isNaN(Date.parse(opts.since)) ? new Date(opts.since) : new Date(Date.now() - 7 * 86_400_000);
  const after = (iso: string) => Date.parse(iso) >= sinceDate.getTime();
  const decisions = m.decisions.filter((d) => d.companyId === companyId && after(d.createdAt));
  const meetings = m.meetings.filter((r) => r.companyId === companyId && after(r.updatedAt));
  const myTasks = data.tasks.filter((t) => t.companyId === companyId && after(t.createdAt) && (!opts.memberId || t.assigneeId === opts.memberId));
  const pending = data.approvals.filter((a) => a.companyId === companyId && a.status === "en_attente");
  const activity = data.activity.filter((a) => a.companyId === companyId && after(a.createdAt)).slice(0, 15);
  return {
    since: sinceDate.toISOString(),
    summary: `Depuis le ${sinceDate.toISOString().slice(0, 10)} : ${decisions.length} décision(s), ${meetings.length} réunion(s), ${myTasks.length} tâche(s)${opts.memberId ? " qui vous sont assignées" : ""}, ${pending.length} approbation(s) en attente.`,
    decisions: decisions.map((d) => d.title),
    actions: myTasks.map((t) => ({ title: t.title, assignee: data.members.find((x) => x.id === t.assigneeId)?.name, dueDate: t.dueDate?.slice(0, 10) })),
    keyPoints: meetings.map((r) => `Réunion « ${r.title} » : ${r.analysis?.summary ?? "en cours"}`),
    items: activity.map((a) => ({ label: a.details, date: a.createdAt })),
    mode: "demo",
  };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Douala", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Procès-verbal de réunion en Markdown (exportable en .md, imprimable en PDF via la version HTML). */
export function buildPvMarkdown(meeting: Meeting, companyName: string, decisions: Decision[], members: Member[]): string {
  const a = meeting.analysis;
  const lines = [
    `# Procès-verbal de réunion — ${meeting.title}`,
    "",
    `**Entreprise :** ${companyName}  `,
    `**Date :** ${fmtDate(meeting.date)} (heure de Douala)  `,
    `**Participants :** ${meeting.participants.join(", ") || "non renseignés"}  `,
    `**Source :** ${meeting.source === "audio" ? `audio transcrit (${meeting.transcription?.provider ?? "?"}${meeting.transcription?.demo ? ", transcription de DÉMO" : ""})` : meeting.source === "dictee" ? "dictée vocale" : "saisie texte"}  `,
    `**Analyse :** ${a ? (a.mode === "llm" ? `IA (${a.provider ?? "modèle"})` : "règles automatiques (mode démo)") : "non analysée"}`,
    meeting.isExample ? "\n> ⚠️ Réunion d'EXEMPLE (données de démonstration fictives)." : "",
    "",
    "## Résumé",
    "",
    a?.summary ?? "Réunion non encore analysée.",
    "",
  ];
  if (a?.keyPoints.length) lines.push("## Points abordés", "", ...a.keyPoints.map((p) => `- ${p}`), "");
  lines.push("## Décisions", "");
  if (!decisions.length && !a?.decisions.length) lines.push("Aucune décision consignée.", "");
  const shown = decisions.length ? decisions : (a?.decisions ?? []).map((d) => ({ title: d.title, rationale: d.rationale, legal: null as LegalSnapshot | null }));
  shown.forEach((d, i) => {
    lines.push(`${i + 1}. **${d.title}**${d.rationale ? ` — ${d.rationale}` : ""}`);
    if (d.legal) for (const l of snapshotLines(d.legal)) lines.push(`   - Fondement consulté : ${l}`);
  });
  lines.push("", "## Actions décidées", "", "| Action | Responsable | Échéance |", "|---|---|---|");
  for (const x of a?.actions ?? []) lines.push(`| ${x.title} | ${x.assigneeName ?? (x.assigneeId ? members.find((mm) => mm.id === x.assigneeId)?.name : undefined) ?? "à désigner"} | ${x.dueDate ?? "—"} |`);
  if (!a?.actions.length) lines.push("| Aucune action | — | — |");
  lines.push("", "## Transcription", "", ...meeting.transcript.split("\n").map((l) => `> ${l}`), "", "_PV généré automatiquement par Co-founder : à relire et faire approuver par les participants._");
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

export async function getMeetingPv(meetingId: string) {
  const { data, meeting } = await loadMeeting(meetingId);
  const company = data.companies.find((c) => c.id === meeting.companyId);
  const decisions = readMemo(data).decisions.filter((d) => meeting.decisionIds.includes(d.id));
  const md = buildPvMarkdown(meeting, company?.name ?? "", decisions, data.members.filter((x) => x.companyId === meeting.companyId));
  return { meeting, markdown: md, filename: `PV-${meeting.date.slice(0, 10)}-${meeting.title.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}` };
}

/** Enregistre le PV dans les Documents du workspace (type « pv »). */
export async function savePvDocument(meetingId: string, actor = "utilisateur"): Promise<WorkspaceDocument> {
  const { meeting, markdown } = await getMeetingPv(meetingId);
  return withMemo((data, m) => {
    const t = nowIso();
    const live = m.meetings.find((x) => x.id === meeting.id)!;
    const existing = live.pvDocumentId ? data.documents.find((x) => x.id === live.pvDocumentId) : undefined;
    if (existing) {
      existing.content = markdown;
      existing.updatedAt = t;
      log(data, meeting.companyId, actor, "document.mise_a_jour", `PV « ${meeting.title} » mis à jour.`);
      return existing;
    }
    const doc: WorkspaceDocument = { id: newId("doc"), companyId: meeting.companyId, title: `PV — ${meeting.title}`, kind: "pv", content: markdown, createdBy: actor, createdAt: t, updatedAt: t, needsReview: true };
    data.documents.push(doc);
    live.pvDocumentId = doc.id;
    log(data, meeting.companyId, actor, "document.creation", `PV de la réunion « ${meeting.title} » enregistré dans Documents.`);
    return doc;
  });
}

export async function listMeetings(companyId: string) {
  await ensureMemoireSeed(companyId);
  const data = await readData();
  return readMemo(data).meetings.filter((x) => x.companyId === companyId).sort((a, b) => b.date.localeCompare(a.date));
}
