import type { MeetingAction, MeetingAnalysis } from "./types";

/**
 * Analyse d'une transcription de réunion SANS IA (mode démo) : règles explicites,
 * déterministes et testables. Le mode LLM (voir meetings.ts) produit la même structure.
 */

export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type TranscriptLine = { index: number; time?: string; seconds?: number; speaker?: string; text: string };

const LINE_RE = /^\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*)?(?:([A-ZÀ-Ý][\p{L}'’.-]*(?:\s+[A-ZÀ-Ý][\p{L}'’.-]*){0,2})\s*:\s+)?(.+)$/u;

export function toSeconds(t: string): number {
  const parts = t.split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseTranscript(transcript: string): TranscriptLine[] {
  return transcript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((raw, index) => {
      const m = raw.match(LINE_RE);
      if (!m) return { index, text: raw };
      return { index, time: m[1], seconds: m[1] ? toSeconds(m[1]) : undefined, speaker: m[2]?.trim(), text: m[3].trim() };
    });
}

const DECISION_RE = /\b(on (a )?decide|nous (avons )?decide|c.est decide|decision\s*:|on retient|nous retenons|on valide|valide\b|on adopte|adopte\b|on choisit|nous choisissons|on part sur|accord pour|on opte|nous optons|il est convenu|convenu que)/;
const ACTION_RE = /(\baction\s*:|\btodo\b|\ba faire\s*:|\b(doit|devra|devront|va (preparer|envoyer|appeler|contacter|rediger|faire|organiser|deposer|ouvrir|lancer|finaliser|verifier|demander|relancer)|se charge|s.occupe|je m.en charge|je m.engage|je vais|il faut que|charge de)\b)/;
const NOT_ACTION = /\b(on (a )?decide|decision\s*:)/;

export type Person = { id?: string; name: string };

function firstName(name: string) {
  return norm(name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] ?? "");
}

/** Trouve la personne désignée : nom cité dans la phrase, sinon l'orateur s'il s'engage (« je vais… »). */
export function findAssignee(text: string, speaker: string | undefined, people: Person[]): Person | undefined {
  const t = norm(text);
  const named = people.find((p) => {
    const f = firstName(p.name);
    return f.length > 1 && new RegExp(`(^|[^a-z])${f}([^a-z]|$)`).test(t);
  });
  if (named) return named;
  if (speaker && /\b(je vais|je m.en charge|je m.engage|je prepare|je m.occupe|je fais|je contacte|j.envoie|j.appelle)\b/.test(t)) {
    const sp = firstName(speaker);
    return people.find((p) => firstName(p.name) === sp) ?? { name: speaker };
  }
  return undefined;
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Échéance exprimée en français → AAAA-MM-JJ (relative à `base`). */
export function parseDueDate(text: string, base = new Date()): string | undefined {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const fr = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (fr) return `${fr[3] ?? base.getFullYear()}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  const t = norm(text);
  const d = new Date(base);
  const rel = t.match(/dans (\d{1,3}) (jours?|semaines?)/);
  if (rel) {
    d.setDate(d.getDate() + Number(rel[1]) * (rel[2].startsWith("semaine") ? 7 : 1));
    return d.toISOString().slice(0, 10);
  }
  if (/\bdemain\b/.test(t)) {
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/semaine prochaine/.test(t)) {
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const wd = t.match(/\b(?:d.ici|avant|pour|le) (lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]);
    const delta = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

function cleanAction(text: string, assignee?: Person) {
  let t = text.replace(/^(action|todo|a faire|à faire)\s*:\s*/i, "");
  if (assignee) {
    const f = assignee.name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0];
    t = t.replace(new RegExp(`^${f}\\s*(\\(.*?\\))?\\s*[,:—–-]?\\s*`, "i"), "");
  }
  t = t
    .replace(/^(je vais|je m['’]engage à|je m['’]en charge\s*:?|il faut que \S+|doit|devra|va|se charge de|s['’]occupe de)\s+/i, "")
    .replace(/\s*(d['’]ici|avant le|avant|pour le|dans \d+ (jours?|semaines?)|demain|la semaine prochaine)\b.*$/i, "")
    .replace(/[.!;]+$/, "")
    .trim();
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 140);
}

function cleanDecision(text: string) {
  const t = text
    .replace(/\s*,?\s*\b(car|parce que|parce qu['’]|puisque)\b.*$/i, "")
    .replace(/^(decision|décision)\s*:\s*/i, "")
    .replace(/^(donc\s*,?\s*)?(on (a )?d[ée]cid[ée]|nous (avons )?d[ée]cid[ée]|c['’]est d[ée]cid[ée]\s*:?|on retient|nous retenons|on valide|on adopte|on choisit|nous choisissons|on part sur|on opte pour|nous optons pour|il est convenu que)\s*(de |d['’]|que |:)?\s*/i, "")
    .replace(/[.!;]+$/, "")
    .trim();
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 160);
}

function rationaleOf(text: string) {
  const m = text.match(/\b(?:car|parce que|parce qu['’]|puisque|afin de|pour (?:pouvoir|éviter|limiter|garder))\b(.+)$/i);
  if (!m) return "";
  const r = m[0].replace(/^(car|parce que|parce qu['’]|puisque)\s*/i, "").replace(/[.!;]+$/, "").trim();
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function analyzeTranscriptDemo(transcript: string, people: Person[], base = new Date()): MeetingAnalysis {
  const lines = parseTranscript(transcript);
  const decisions: MeetingAnalysis["decisions"] = [];
  const actions: (MeetingAction & { line?: number })[] = [];
  const other: string[] = [];
  for (const line of lines) {
    const t = norm(line.text);
    if (DECISION_RE.test(t)) {
      decisions.push({ title: cleanDecision(line.text), rationale: rationaleOf(line.text), line: line.index });
      continue;
    }
    if (ACTION_RE.test(t) && !NOT_ACTION.test(t)) {
      const who = findAssignee(line.text, line.speaker, people);
      actions.push({ title: cleanAction(line.text, who), assigneeId: who?.id, assigneeName: who?.name, dueDate: parseDueDate(line.text, base), line: line.index });
      continue;
    }
    if (line.text.length > 25) other.push(`${line.speaker ? `${line.speaker} : ` : ""}${line.text}`);
  }
  const speakers = [...new Set(lines.map((l) => l.speaker).filter(Boolean))];
  const keyPoints = other.slice(0, 5).map((p) => (p.length > 160 ? `${p.slice(0, 157)}…` : p));
  const summary = lines.length
    ? `${lines.length} intervention(s)${speakers.length ? ` de ${speakers.join(", ")}` : ""} : ${decisions.length} décision(s) et ${actions.length} action(s) identifiée(s).${decisions.length ? ` Décisions : ${decisions.map((d) => d.title).join(" ; ")}.` : ""}`
    : "Transcription vide.";
  return { summary, keyPoints, decisions, actions, mode: "demo" };
}

/** Index de la ligne à partir de laquelle le membre a rejoint (horodatage mm:ss, numéro de ligne ou pourcentage). */
export function joinIndex(lines: TranscriptLine[], since?: string | number): number {
  if (since === undefined || since === "") return lines.length;
  const s = String(since).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const sec = toSeconds(s);
    const i = lines.findIndex((l) => l.seconds !== undefined && l.seconds >= sec);
    return i === -1 ? lines.length : i;
  }
  const pct = s.match(/^(\d{1,3})\s*%$/);
  if (pct) return Math.round((Math.min(100, Number(pct[1])) / 100) * lines.length);
  if (/^\d+$/.test(s)) return Math.min(Number(s), lines.length);
  return lines.length;
}
