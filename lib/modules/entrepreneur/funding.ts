/**
 * Module Financement : base de programmes (réels vérifiés + exemples), matching d'éligibilité,
 * préparation du dossier de candidature, suivi et relances via la file d'approbation existante.
 */
import { groundingMarkdown } from "@/lib/legal/grounding";
import { proposeExternalMessage } from "@/lib/workspace/actions";
import { createTask, saveDocument, WorkspaceError } from "@/lib/workspace/service";
import { newId, nowIso } from "@/lib/workspace/store";
import { basis, basisData } from "./grounding";
import { evaluateProgram, type Eligibility } from "./eligibility";
import { ideaMarkdown } from "./idea";
import { ALL_PROGRAMS, getProgram, type FundingProgram, type ProgramType } from "./programs";
import { readModule, withModule } from "./store";
import { skillGaps } from "./scoring";
import type { Ctx, EntrepreneurProfile, FundingApplication, FundingApplicationStatus } from "./types";
import { guardRecipient } from "./util";

export const APPLICATION_STATUSES: FundingApplicationStatus[] = ["a_preparer", "dossier_pret", "soumise", "en_attente_reponse", "acceptee", "refusee", "abandonnee"];
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function listPrograms(filter: { type?: string; onlyVerified?: boolean; query?: string } = {}) {
  const q = (filter.query ?? "").toLowerCase();
  return ALL_PROGRAMS.filter((p) => (!filter.type || p.type === (filter.type as ProgramType)) && (!filter.onlyVerified || p.verified) && (!q || `${p.name} ${p.organization} ${p.summary}`.toLowerCase().includes(q)));
}

export async function getProfile(companyId: string): Promise<EntrepreneurProfile | undefined> {
  const { m } = await readModule(companyId);
  return m.profiles.find((p) => p.companyId === companyId);
}

export async function updateProfile(companyId: string, patch: Partial<EntrepreneurProfile>) {
  return withModule(companyId, (m) => {
    let p = m.profiles.find((x) => x.companyId === companyId);
    if (!p) {
      p = { companyId, updatedAt: nowIso() };
      m.profiles.push(p);
    }
    const allowed: (keyof EntrepreneurProfile)[] = ["founderAge", "womanFounder", "hasPrototype", "isRegistered", "hasRevenue", "isDigital", "fundingRaisedUsd", "yearsOperating", "teamSize"];
    for (const k of allowed) if (patch[k] !== undefined) (p as Record<string, unknown>)[k] = patch[k];
    p.updatedAt = nowIso();
    return p;
  });
}

export async function matchPrograms(companyId: string, opts: { includeExamples?: boolean; type?: string } = {}) {
  const { company, m } = await readModule(companyId);
  const profile = m.profiles.find((p) => p.companyId === companyId);
  const order = { eligible: 0, a_verifier: 1, non_eligible: 2 } as const;
  const rows = listPrograms({ type: opts.type })
    .filter((p) => opts.includeExamples !== false || !p.isExample)
    .map((p) => ({ program: p, eligibility: evaluateProgram(p, company, profile) }))
    .sort((a, b) => order[a.eligibility.verdict] - order[b.eligibility.verdict] || b.eligibility.score - a.eligibility.score || Number(a.program.isExample) - Number(b.program.isExample));
  const missingProfile = (["founderAge", "hasPrototype", "isRegistered", "hasRevenue", "yearsOperating", "teamSize"] as const).filter((k) => profile?.[k] === undefined);
  return { company, profile, rows, missingProfile };
}

function dossierMarkdown(p: FundingProgram, e: Eligibility, snap: Awaited<ReturnType<typeof readModule>>, extra: string) {
  const { company, m, data } = snap;
  const members = data.members.filter((x) => x.companyId === company.id);
  const idea = m.ideas.find((i) => i.companyId === company.id);
  const gaps = skillGaps(company, members, m.memberSkills.filter((s) => s.companyId === company.id));
  const mark = { ok: "✅", ko: "❌", a_verifier: "❔" } as const;
  return [
    `# Dossier de candidature — ${p.name}${p.isExample ? " (programme d'EXEMPLE, fictif)" : ""}`,
    "",
    p.isExample ? "> ⚠️ Programme d'exemple pour la démonstration : ne pas soumettre." : `> Programme réel vérifié le ${p.verifiedAt} — sources : ${p.sources.join(" ; ")}. Revérifiez critères et dates sur la page officielle avant de soumettre.`,
    "",
    "## 1. Programme",
    `- Organisme : ${p.organization}`,
    `- Avantages : ${p.benefits.join(" ; ")}`,
    `- Calendrier : ${e.window}`,
    `- Candidature : ${p.applyUrl}`,
    "",
    "## 2. Éligibilité (auto-évaluation)",
    "| Critère | Statut | Détail |",
    "|---|---|---|",
    ...e.results.map((r) => `| ${r.label} | ${mark[r.status]} | ${r.detail} |`),
    "",
    `Verdict : **${e.verdict === "eligible" ? "éligible" : e.verdict === "non_eligible" ? "non éligible en l'état" : "à vérifier"}**${p.caveat ? ` — ${p.caveat}` : ""}`,
    "",
    "## 3. Présentation du projet (à compléter)",
    `- Entreprise : ${company.name.replace(" (démo)", "")} — ${company.legalForm}, ${company.city}, ${company.country}`,
    `- Secteur : ${company.sector}`,
    `- Problème et solution : ${company.description || "[à compléter]"}`,
    "- Cible et taille de marché : [à compléter — aucun chiffre n'est pré-rempli]",
    "- Modèle de revenus : [à compléter]",
    "- Traction (clients, revenus, pilotes) : [à compléter avec des données vérifiables]",
    "- Impact (emplois, inclusion, environnement) : [à compléter]",
    "- Utilisation des fonds : [à compléter]",
    extra ? `\nNotes de l'entrepreneur : ${extra}` : "",
    "",
    "## 4. Équipe",
    ...members.map((x) => `- ${x.name} — ${x.role}${m.memberSkills.find((s) => s.memberId === x.id)?.skills.length ? ` (${m.memberSkills.find((s) => s.memberId === x.id)!.skills.join(", ")})` : ""}`),
    gaps.gaps.length ? `- Compétences à renforcer : ${gaps.gaps.map((g) => g.label).join(", ")}` : "- Compétences critiques couvertes.",
    "",
    "## 5. Pièces à réunir",
    ...p.documents.map((d) => `- [ ] ${d}`),
    "",
    idea ? `## 6. Diagnostic de l'idée (résumé)\n${ideaMarkdown(idea, company.name).split("\n").slice(2, 14).join("\n")}` : "## 6. Diagnostic de l'idée\nAucun diagnostic : lancez « Analyser l'idée » pour l'ajouter.",
  ].join("\n");
}

export async function prepareApplication(companyId: string, programId: string, ctx: Ctx, notes = "", actor = "agent") {
  const p = getProgram(programId);
  if (!p) throw new WorkspaceError("Programme introuvable.", 404);
  const snap = await readModule(companyId);
  const profile = snap.m.profiles.find((x) => x.companyId === companyId);
  const e = evaluateProgram(p, snap.company, profile);
  const g = await basis(ctx, `régime juridique ${snap.company.sector} ${snap.company.sectorKeywords.slice(0, 3).join(" ")} autorisation exercice activité`, 3);
  const content = `${dossierMarkdown(p, e, snap, notes)}\n${groundingMarkdown(g)}`;
  const doc = await saveDocument(companyId, { title: `Dossier de candidature — ${p.name}`, kind: "note", content, needsReview: true }, actor);
  const app = await withModule(companyId, (m) => {
    let a = m.applications.find((x) => x.companyId === companyId && x.programId === programId && !["refusee", "abandonnee", "acceptee"].includes(x.status));
    if (!a) {
      a = { id: newId("fin"), companyId, programId, programName: p.name, status: "dossier_pret", followUps: [], notes: [], contactEmail: p.contactEmail, createdAt: nowIso(), updatedAt: nowIso() } as FundingApplication;
      m.applications.push(a);
    }
    a.documentId = doc.id;
    if (a.status === "a_preparer") a.status = "dossier_pret";
    if (notes) a.notes.push(notes);
    a.updatedAt = nowIso();
    return a;
  });
  return { application: app, documentId: doc.id, eligibility: e, fondement_juridique: basisData(g), program: p };
}

export async function listApplications(companyId: string) {
  const { m, data } = await readModule(companyId);
  return m.applications
    .filter((a) => a.companyId === companyId)
    .map((a) => ({
      ...a,
      followUps: a.followUps.map((f) => ({ ...f, emailStatus: data.emails.find((e) => e.id === f.emailId)?.status ?? "inconnu", approvalStatus: data.approvals.find((x) => x.id === f.approvalId)?.status ?? "inconnu" })),
      due: Boolean(a.nextFollowUp && a.nextFollowUp.slice(0, 10) <= nowIso().slice(0, 10) && ["soumise", "en_attente_reponse"].includes(a.status)),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateApplication(companyId: string, applicationId: string, patch: { status?: string; note?: string; contactEmail?: string; nextFollowUp?: string }, actor = "utilisateur") {
  if (patch.status && !APPLICATION_STATUSES.includes(patch.status as FundingApplicationStatus)) throw new WorkspaceError("Statut de candidature invalide.");
  if (patch.contactEmail && !EMAIL_RE.test(patch.contactEmail)) throw new WorkspaceError("Email de contact invalide.");
  const app = await withModule(companyId, (m) => {
    const a = m.applications.find((x) => x.id === applicationId && x.companyId === companyId);
    if (!a) throw new WorkspaceError("Candidature introuvable.", 404);
    if (patch.status) {
      a.status = patch.status as FundingApplicationStatus;
      if (a.status === "soumise" && !a.submittedAt) {
        a.submittedAt = nowIso();
        if (!a.nextFollowUp && !patch.nextFollowUp) a.nextFollowUp = new Date(Date.now() + 21 * 86400000).toISOString();
      }
    }
    if (patch.note) a.notes.push(patch.note);
    if (patch.contactEmail) a.contactEmail = patch.contactEmail;
    if (patch.nextFollowUp && /^\d{4}-\d{2}-\d{2}/.test(patch.nextFollowUp)) a.nextFollowUp = new Date(patch.nextFollowUp).toISOString();
    a.updatedAt = nowIso();
    return { ...a };
  });
  if (patch.status === "soumise" && app.nextFollowUp) {
    await createTask(companyId, { title: `Relancer : ${app.programName}`, dueDate: app.nextFollowUp, description: "Rappel automatique 3 semaines après soumission (module Financement)." }, actor);
  }
  return app;
}

/** Prépare une relance par email ; elle n'est envoyée qu'après validation dans la file d'approbation. */
export async function followUpApplication(companyId: string, applicationId: string, opts: { to?: string; message?: string; senderName?: string }, actor = "agent") {
  const { m, company, data } = await readModule(companyId);
  const a = m.applications.find((x) => x.id === applicationId && x.companyId === companyId);
  if (!a) throw new WorkspaceError("Candidature introuvable.", 404);
  if (!["soumise", "en_attente_reponse"].includes(a.status)) throw new WorkspaceError("Seules les candidatures soumises ou en attente de réponse peuvent être relancées.", 409);
  const to = (opts.to || a.contactEmail || "").trim();
  if (!EMAIL_RE.test(to)) throw new WorkspaceError("Indiquez l'adresse de contact du programme (aucune adresse connue).");
  const owner = data.members.find((x) => x.companyId === companyId && x.role === "proprietaire");
  const name = company.name.replace(" (démo)", "");
  const body =
    opts.message?.trim() ||
    `Bonjour,\n\nNous avons soumis la candidature de ${name} au programme « ${a.programName} »${a.submittedAt ? ` le ${new Date(a.submittedAt).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" })}` : ""}.\nPourriez-vous nous indiquer l'état d'avancement de son examen et, le cas échéant, les éléments complémentaires attendus ?\n\nNous restons à votre disposition.\n\nCordialement,\n${opts.senderName || owner?.name || "Le fondateur"}\n${name}`;
  const dest = guardRecipient(to, `programme-${a.programId}`);
  const { email, approval } = await proposeExternalMessage(
    companyId,
    {
      module: "fund",
      type: "fund_relance",
      title: `Relancer le programme ${a.programName}`,
      summary: `Relance de la candidature de ${name}${dest.officialContact ? ` (contact officiel ${dest.officialContact} remplacé par une adresse de démo pendant le développement)` : ""}.`,
      channel: "email",
      to: [dest.to],
      subject: `Suivi de candidature — ${a.programName} — ${name}`,
      body,
      relatedType: "fund_application",
      relatedId: a.id,
      legalQuery: "subvention aide financement obligations du bénéficiaire données à caractère personnel",
    },
    actor,
  );
  const updated = await withModule(companyId, (mod) => {
    const x = mod.applications.find((y) => y.id === applicationId)!;
    x.followUps.push({ emailId: email.id, approvalId: approval.id, createdAt: nowIso() });
    x.status = "en_attente_reponse";
    x.nextFollowUp = new Date(Date.now() + 14 * 86400000).toISOString();
    x.updatedAt = nowIso();
    return { ...x };
  });
  return { application: updated, emailId: email.id, approvalId: approval.id, to: dest.to, officialContact: dest.officialContact, legalCheck: approval.legalCheck };
}
