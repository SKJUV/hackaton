import type { WorkspaceData } from "@/lib/workspace/types";
import { readMemo } from "./store";
import type { ScoreComponent, ScoreResult } from "./types";

/**
 * Score Co-founder — score de crédibilité calculé UNIQUEMENT à partir du journal et des données du workspace.
 * Méthodologie publique, versionnée, affichée dans l'app et sur la page de vérification.
 */
export const METHODOLOGY_VERSION = "2026.10-1";

export const METHODOLOGY = {
  version: METHODOLOGY_VERSION,
  intro:
    "Le Score Co-founder (0–100) mesure la fiabilité d'exécution documentée dans Co-founder. Il est calculé uniquement à partir des tâches, échéances, réunions, approbations, démarches et décisions enregistrées dans le workspace et son journal d'audit. Il ne s'appuie sur aucune donnée externe et ne constitue ni une notation financière ni un avis de crédit.",
  criteria: [
    { key: "delais", label: "Délais tenus", weight: 0.3, rule: "Tâches avec échéance : terminées au plus tard le jour de l'échéance (date de clôture lue dans le journal d'audit) ÷ (terminées à temps + en retard). Une tâche ouverte dont l'échéance est passée compte en retard. Obligations du calendrier : faites = tenues, non faites après échéance = en retard. Les éléments sans date de clôture journalisée ou non échus sont exclus." },
    { key: "engagements", label: "Engagements respectés", weight: 0.3, rule: "Actions assignées en réunion terminées ÷ (terminées + échues non faites), et approbations traitées sous 7 jours ÷ approbations échues (traitées ou en attente depuis plus de 7 jours)." },
    { key: "objectifs", label: "Objectifs atteints", weight: 0.25, rule: "Démarches de création terminées ÷ démarches prévues." },
    { key: "decisions", label: "Décisions documentées et sourcées", weight: 0.15, rule: "Pour chaque décision du registre : motivation consignée (50 %), élément source lié — réunion, document, email (25 %), texte officiel trouvé lors de la recherche juridique au moment de la décision (25 %)." },
  ],
  aggregation: "Moyenne pondérée des critères disposant de données ; un critère sans aucune donnée évaluable est exclu et les poids restants sont renormalisés. Niveaux : < 40 insuffisant, 40–59 en construction, 60–79 fiable, ≥ 80 très fiable.",
  signature: "Chaque attestation est signée en Ed25519 sur la forme canonique (JSON à clés triées) de son contenu. La page publique /verifier/<id> revérifie la signature avec la clé publique publiée et indique si l'attestation a été révoquée ou a expiré (90 jours).",
} as const;

const pct = (num: number, den: number) => (den ? Math.round((num / den) * 100) : null);

function completionDates(data: WorkspaceData, companyId: string): Map<string, string> {
  const map = new Map<string, string>();
  // Le journal est trié du plus récent au plus ancien : on garde la DERNIÈRE clôture.
  for (const a of data.activity) {
    if (a.companyId !== companyId || a.action !== "tache.statut") continue;
    const m = a.details.match(/^« (.+) » → fait\.?$/);
    if (m && !map.has(m[1])) map.set(m[1], a.createdAt);
  }
  return map;
}

const endOfDay = (iso: string) => {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 999);
  return d.getTime();
};

export function computeScore(data: WorkspaceData, companyId: string, now = new Date()): ScoreResult {
  const tasks = data.tasks.filter((t) => t.companyId === companyId);
  const done = completionDates(data, companyId);
  const nowMs = now.getTime();

  // 1. Délais
  let onTime = 0, late = 0, unverifiable = 0, pending = 0, oblDone = 0, oblLate = 0;
  for (const t of tasks) {
    if (!t.dueDate) continue;
    if (t.status === "fait") {
      const at = done.get(t.title);
      if (!at) unverifiable += 1;
      else if (Date.parse(at) <= endOfDay(t.dueDate)) onTime += 1;
      else late += 1;
    } else if (endOfDay(t.dueDate) < nowMs) late += 1;
    else pending += 1;
  }
  for (const o of data.obligations.filter((x) => x.companyId === companyId)) {
    if (o.done) oblDone += 1;
    else if (endOfDay(o.dueDate) < nowMs) oblLate += 1;
  }
  const delais: ScoreComponent = {
    key: "delais", label: "Délais tenus", weight: 0.3,
    score: pct(onTime + oblDone, onTime + oblDone + late + oblLate),
    evidence: { taches_a_temps: onTime, taches_en_retard: late, obligations_faites: oblDone, obligations_en_retard: oblLate, exclues_non_verifiables: unverifiable, exclues_non_echues: pending },
    explanation: `${onTime + oblDone} échéance(s) tenue(s), ${late + oblLate} en retard.`,
  };

  // 2. Engagements
  const m = readMemo(data);
  const meetingTaskIds = new Set(m.meetings.filter((x) => x.companyId === companyId).flatMap((x) => x.taskIds));
  let kept = 0, broken = 0;
  for (const t of tasks.filter((x) => meetingTaskIds.has(x.id))) {
    if (t.status === "fait") kept += 1;
    else if (t.dueDate && endOfDay(t.dueDate) < nowMs) broken += 1;
  }
  let apprOk = 0, apprLate = 0;
  const week = 7 * 86_400_000;
  for (const a of data.approvals.filter((x) => x.companyId === companyId)) {
    const created = Date.parse(a.createdAt);
    if (a.decidedAt) (Date.parse(a.decidedAt) - created <= week ? apprOk++ : apprLate++);
    else if (nowMs - created > week) apprLate += 1;
  }
  const engagements: ScoreComponent = {
    key: "engagements", label: "Engagements respectés", weight: 0.3,
    score: pct(kept + apprOk, kept + broken + apprOk + apprLate),
    evidence: { actions_reunion_tenues: kept, actions_reunion_echues_non_faites: broken, approbations_sous_7_jours: apprOk, approbations_tardives: apprLate },
    explanation: `${kept} action(s) de réunion tenue(s) sur ${kept + broken} échue(s) ; ${apprOk} approbation(s) traitée(s) sous 7 jours sur ${apprOk + apprLate}.`,
  };

  // 3. Objectifs
  const steps = data.checklist.filter((c) => c.companyId === companyId);
  const stepsDone = steps.filter((c) => c.status === "fait").length;
  const objectifs: ScoreComponent = {
    key: "objectifs", label: "Objectifs atteints", weight: 0.25,
    score: pct(stepsDone, steps.length),
    evidence: { demarches_terminees: stepsDone, demarches_prevues: steps.length },
    explanation: `${stepsDone}/${steps.length} démarche(s) de création terminée(s).`,
  };

  // 4. Décisions documentées
  const decisions = m.decisions.filter((d) => d.companyId === companyId && d.status !== "abandonnee");
  let points = 0, motivated = 0, linked = 0, grounded = 0;
  for (const d of decisions) {
    const hasWhy = d.rationale.trim().length >= 10;
    const hasSource = d.sources.length > 0;
    const hasLaw = d.legal.status !== "non_couvert" && d.legal.sources.some((s) => !s.isExample);
    motivated += hasWhy ? 1 : 0;
    linked += hasSource ? 1 : 0;
    grounded += hasLaw ? 1 : 0;
    points += (hasWhy ? 0.5 : 0) + (hasSource ? 0.25 : 0) + (hasLaw ? 0.25 : 0);
  }
  const decisionsC: ScoreComponent = {
    key: "decisions", label: "Décisions documentées et sourcées", weight: 0.15,
    score: decisions.length ? Math.round((points / decisions.length) * 100) : null,
    evidence: { decisions: decisions.length, motivees: motivated, avec_source: linked, avec_texte_officiel: grounded },
    explanation: `${decisions.length} décision(s) : ${motivated} motivée(s), ${linked} reliée(s) à une source, ${grounded} avec texte officiel.`,
  };

  const components = [delais, engagements, objectifs, decisionsC];
  const active = components.filter((c) => c.score !== null);
  const wsum = active.reduce((s, c) => s + c.weight, 0);
  const score = wsum ? Math.round(active.reduce((s, c) => s + c.weight * (c.score as number), 0) / wsum) : 0;
  const level: ScoreResult["level"] = score >= 80 ? "tres_fiable" : score >= 60 ? "fiable" : score >= 40 ? "en_construction" : "insuffisant";
  const dataPoints = onTime + late + oblDone + oblLate + kept + broken + apprOk + apprLate + steps.length + decisions.length;
  return { score, level, components, methodologyVersion: METHODOLOGY_VERSION, computedAt: now.toISOString(), dataPoints };
}

export const LEVEL_LABEL: Record<ScoreResult["level"], string> = { insuffisant: "Insuffisant", en_construction: "En construction", fiable: "Fiable", tres_fiable: "Très fiable" };
