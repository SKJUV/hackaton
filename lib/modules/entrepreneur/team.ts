/**
 * Module Équipe & recrutement : compétences manquantes, profils clés, fiches de poste, import et filtrage
 * objectif des candidatures, analyse collaborative, alertes de biais affinitaire, conformité.
 */
import { groundingMarkdown } from "@/lib/legal/grounding";
import { saveDocument, WorkspaceError } from "@/lib/workspace/service";
import { newId, nowIso } from "@/lib/workspace/store";
import type { Member } from "@/lib/workspace/types";
import { basis, basisData, labourLaw } from "./grounding";
import { biasAlerts, collaborative, keyProfiles, RELATION_LABEL, scoreCandidate, skillGaps } from "./scoring";
import { readModule, withModule } from "./store";
import type { Candidate, Ctx, JobCriterion, JobOpening, Relation } from "./types";

const RELATIONS: Relation[] = ["aucune", "ami", "famille", "ancien_collegue", "recommandation"];

export async function teamGaps(companyId: string) {
  const { company, m, data } = await readModule(companyId);
  const members = data.members.filter((x) => x.companyId === companyId);
  const g = skillGaps(company, members, m.memberSkills.filter((s) => s.companyId === companyId));
  return { ...g, profiles: keyProfiles(g.gaps) };
}

export async function setMemberSkills(companyId: string, memberId: string, skills: string[]) {
  return withModule(companyId, (m, data) => {
    if (!data.members.some((x) => x.id === memberId && x.companyId === companyId)) throw new WorkspaceError("Membre introuvable dans cette entreprise.", 404);
    const clean = [...new Set(skills.map((s) => s.trim()).filter(Boolean))].slice(0, 30);
    const row = m.memberSkills.find((x) => x.memberId === memberId && x.companyId === companyId);
    if (row) row.skills = clean;
    else m.memberSkills.push({ companyId, memberId, skills: clean });
    return { memberId, skills: clean };
  });
}

/** Conformité du recrutement : droit du travail (cité seulement s'il est dans le corpus) + données personnelles des candidats. */
export async function recruitmentCompliance(ctx: Ctx, topic = "recrutement embauche") {
  const travail = await labourLaw(ctx, topic);
  const donnees = await basis(ctx, "données à caractère personnel collecte traitement consentement conservation", 3);
  return {
    droit_du_travail: travail,
    donnees_personnelles: basisData(donnees),
    bonnes_pratiques: [
      "Critères du poste fixés AVANT de lire les candidatures, identiques pour tous.",
      "Score calculé sur le contenu professionnel uniquement (nom, email, téléphone retirés ; âge, genre, origine, photo jamais lus).",
      "Candidats informés de l'usage de leurs données et conservation limitée à la durée du recrutement (fondement : voir données personnelles ci-dessus).",
      "Toute relation personnelle avec un candidat est déclarée ; la personne concernée ne l'évalue pas.",
    ],
    _grounding: donnees,
  };
}

export async function createJob(companyId: string, input: { title: string; kind?: JobOpening["kind"]; criteria?: JobCriterion[]; minYears?: number; threshold?: number; domain?: string; missions?: string[] }, ctx: Ctx, actor = "agent") {
  const { company } = await readModule(companyId);
  let criteria = (input.criteria ?? []).filter((c) => c.label && c.keywords?.length);
  let missions = input.missions ?? [];
  let minYears = input.minYears;
  if (!criteria.length || input.domain) {
    const gaps = await teamGaps(companyId);
    const profile = gaps.profiles.find((p) => p.domain === input.domain) ?? keyProfiles([{ domain: input.domain ?? "tech", critical: true, why: "" }])[0];
    if (!criteria.length) criteria = profile.criteria;
    if (!missions.length) missions = profile.missions;
    minYears ??= profile.minYears;
  }
  const title = input.title?.trim();
  if (!title) throw new WorkspaceError("Intitulé du poste requis.");
  const threshold = Math.min(95, Math.max(10, Math.round(input.threshold ?? 60)));
  const compliance = await recruitmentCompliance(ctx, `recrutement ${title}`);
  const md = [
    `# Fiche de poste — ${title}`,
    "",
    `Entreprise : ${company.name.replace(" (démo)", "")} (${company.sector}, ${company.city})`,
    `Type : ${input.kind === "cofondateur" ? "co-fondateur·rice (association au capital à négocier ; pacte d'associés recommandé)" : "salarié·e"}`,
    "",
    "## Missions",
    ...(missions.length ? missions : ["[à compléter]"]).map((x) => `- ${x}`),
    "",
    "## Critères objectifs de sélection (pondération)",
    "| Critère | Mots-clés | Poids | Obligatoire |",
    "|---|---|---|---|",
    ...criteria.map((c) => `| ${c.label} | ${c.keywords.join(", ")} | ${c.weight} | ${c.required ? "oui" : "non"} |`),
    minYears ? `| Expérience | ≥ ${minYears} an(s) | 20 | non |` : "",
    "",
    `Seuil de présélection : ${threshold}/100. Les candidatures sous le seuil restent consultables (rien n'est supprimé).`,
    "",
    "## Rémunération et conditions",
    "- Rémunération, durée et lieu : [à définir — aucun montant n'est proposé automatiquement]",
    "",
    "## Conformité",
    `- ${compliance.droit_du_travail.libelle}. ${compliance.droit_du_travail.detail}`,
    ...compliance.bonnes_pratiques.map((b) => `- ${b}`),
  ].join("\n");
  const doc = await saveDocument(companyId, { title: `Fiche de poste — ${title}`, kind: "note", content: `${md}\n${groundingMarkdown(compliance._grounding)}`, needsReview: true }, actor);
  const job = await withModule(companyId, (m) => {
    const j: JobOpening = { id: newId("job"), companyId, title, kind: input.kind ?? "employe", criteria, minYears: minYears ?? 0, threshold, documentId: doc.id, createdAt: nowIso() };
    m.jobs.push(j);
    return j;
  });
  const { _grounding, ...conformite } = compliance;
  void _grounding;
  return { job, documentId: doc.id, conformite };
}

export async function importCandidate(companyId: string, input: { jobId: string; name: string; email?: string; cvText: string; source?: Candidate["source"]; relation?: string; referredBy?: string }) {
  const name = input.name?.trim();
  const cv = input.cvText?.trim();
  if (!name) throw new WorkspaceError("Nom du candidat requis.");
  if (!cv || cv.length < 30) throw new WorkspaceError("Texte du CV trop court (30 caractères minimum).");
  if (input.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.email)) throw new WorkspaceError("Email du candidat invalide.");
  const relation = (RELATIONS.includes(input.relation as Relation) ? input.relation : "aucune") as Relation;
  return withModule(companyId, (m, data) => {
    const job = m.jobs.find((j) => j.id === input.jobId && j.companyId === companyId);
    if (!job) throw new WorkspaceError("Offre introuvable.", 404);
    if (input.referredBy && !data.members.some((x) => x.id === input.referredBy && x.companyId === companyId)) throw new WorkspaceError("Membre recommandant inconnu.", 404);
    const s = scoreCandidate(job, cv.slice(0, 20000), name, input.email);
    const c: Candidate = { id: newId("cand"), companyId, jobId: job.id, name, email: input.email || undefined, cvText: cv.slice(0, 20000), source: input.source ?? "texte", relation, referredBy: input.referredBy || undefined, createdAt: nowIso(), ...s };
    m.candidates.push(c);
    return c;
  });
}

function view(c: Candidate) {
  const { cvText, ...rest } = c;
  return { ...rest, extrait: cvText.slice(0, 280) };
}

export async function screenCandidates(companyId: string, jobId: string, threshold?: number) {
  const { m, data } = await readModule(companyId);
  const job0 = m.jobs.find((j) => j.id === jobId && j.companyId === companyId);
  if (!job0) throw new WorkspaceError("Offre introuvable.", 404);
  const updated = await withModule(companyId, (mod) => {
    const job = mod.jobs.find((j) => j.id === jobId)!;
    if (typeof threshold === "number" && Number.isFinite(threshold)) job.threshold = Math.min(95, Math.max(10, Math.round(threshold)));
    for (const c of mod.candidates.filter((x) => x.jobId === jobId)) Object.assign(c, scoreCandidate(job, c.cvText, c.name, c.email));
    return { job: { ...job }, list: mod.candidates.filter((x) => x.jobId === jobId).map((x) => ({ ...x })) };
  });
  const members = data.members.filter((x) => x.companyId === companyId);
  const reviews = m.reviews.filter((r) => r.companyId === companyId);
  const sorted = updated.list.sort((a, b) => b.score - a.score);
  return {
    job: updated.job,
    retenus: sorted.filter((c) => c.status === "retenu" || c.override).map((c) => ({ ...view(c), collaboratif: collaborative(c, reviews) })),
    sous_seuil: sorted.filter((c) => c.status === "sous_seuil" && !c.override).map(view),
    alertes_biais: biasAlerts(updated.job, updated.list, reviews, members),
  };
}

/** Valide qu'un membre agit en son nom (entreprise réelle) ; jeu de rôle libre pour la démo. */
export function assertReviewer(data: { companies: { id: string; isExample?: boolean }[]; members: Member[] }, companyId: string, memberId: string, viewerEmail: string | null | undefined): Member {
  const member = data.members.find((x) => x.id === memberId && x.companyId === companyId);
  if (!member) throw new WorkspaceError("Membre inconnu dans cette entreprise : sélectionnez votre profil.", 403);
  const company = data.companies.find((c) => c.id === companyId);
  if (viewerEmail !== undefined && !company?.isExample && member.email.toLowerCase() !== (viewerEmail ?? "").toLowerCase()) {
    throw new WorkspaceError("Vous ne pouvez évaluer qu'en votre nom : sélectionnez votre propre profil.", 403);
  }
  return member;
}

export async function reviewCandidate(companyId: string, input: { candidateId: string; memberId: string; rating: number; notes?: string; via?: "agent" }, viewerEmail?: string | null) {
  const rating = Math.round(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new WorkspaceError("Note entre 1 et 5.");
  return withModule(companyId, (m, data) => {
    const c = m.candidates.find((x) => x.id === input.candidateId && x.companyId === companyId);
    if (!c) throw new WorkspaceError("Candidature introuvable.", 404);
    const member = assertReviewer(data, companyId, input.memberId, viewerEmail);
    m.reviews = m.reviews.filter((r) => !(r.candidateId === c.id && r.memberId === member.id));
    const r = { id: newId("rev"), companyId, candidateId: c.id, memberId: member.id, memberName: `${member.name}${input.via === "agent" ? " (via l'agent)" : ""}`, rating, notes: (input.notes ?? "").slice(0, 2000), createdAt: nowIso() };
    m.reviews.push(r);
    const conflict = c.referredBy === member.id ? `Conflit d'intérêts : ${member.name} a recommandé ce candidat (${RELATION_LABEL[c.relation]}) ; récusation conseillée.` : null;
    return { review: r, collaboratif: collaborative(c, m.reviews), alerte: conflict };
  });
}

export async function decideCandidate(companyId: string, input: { candidateId: string; decision?: string; override?: boolean; reason?: string; actor?: string }) {
  return withModule(companyId, (m) => {
    const c = m.candidates.find((x) => x.id === input.candidateId && x.companyId === companyId);
    if (!c) throw new WorkspaceError("Candidature introuvable.", 404);
    if (input.decision) {
      if (!["a_rencontrer", "ecarte", "offre"].includes(input.decision)) throw new WorkspaceError("Décision invalide.");
      c.decision = input.decision as Candidate["decision"];
    }
    if (input.override) {
      if (!input.reason?.trim()) throw new WorkspaceError("Justifiez le passage en liste courte malgré le seuil.");
      c.override = { by: input.actor ?? "utilisateur", reason: input.reason.trim().slice(0, 500), at: nowIso() };
    }
    return view(c);
  });
}
