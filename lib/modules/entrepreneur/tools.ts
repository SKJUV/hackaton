/**
 * Actions du module Entrepreneur exposées comme OUTILS DE L'AGENT (mode LLM et mode démo) et comme API
 * (`POST /api/entrepreneur/<outil>`) pour l'UI du workspace : un seul code pour les deux.
 * Les actions externes (`external: true`) passent par la file d'approbation existante.
 */
import type { AgentTool, ToolResult } from "@/lib/agent/tools";
import { saveDocument, WorkspaceError } from "@/lib/workspace/service";
import { basisData } from "./grounding";
import { analyzeIdea, ideaMarkdown } from "./idea";
import { followUpApplication, listApplications, listPrograms, matchPrograms, prepareApplication, updateApplication, updateProfile } from "./funding";
import { requestMarketQuotes, searchMarket } from "./market";
import { SEED_MENTORS } from "./mentors";
import { matchMentors, requestIntro } from "./network";
import { readModule } from "./store";
import { biasAlerts } from "./scoring";
import { createJob, decideCandidate, importCandidate, recruitmentCompliance, reviewCandidate, screenCandidates, setMemberSkills, teamGaps } from "./team";
import type { Ctx, EntrepreneurProfile } from "./types";
import { bool, num, str, strArr } from "./util";

export type ActionOptions = { actor?: string; viewerEmail?: string | null };
type ModuleTool = Omit<AgentTool, "run"> & { run: (input: Record<string, unknown>, ctx: Ctx, opts?: ActionOptions) => Promise<ToolResult> };

const obj = (properties: Record<string, unknown>, required?: string[]) => ({ type: "object" as const, properties, ...(required ? { required } : {}) });
const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "number", description });
const B = (description: string) => ({ type: "boolean", description });
const A = (description: string) => ({ type: "array", items: { type: "string" }, description });

async function latestJobId(companyId: string, given: unknown) {
  if (str(given)) return str(given);
  const { m } = await readModule(companyId);
  const job = m.jobs.filter((j) => j.companyId === companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!job) throw new WorkspaceError("Aucune offre de poste : rédigez d'abord une fiche de poste.", 404);
  return job.id;
}

export const ENTREPRENEUR_TOOLS: ModuleTool[] = [
  {
    name: "fund_profil_projet",
    description: "Module Entrepreneur — lit et met à jour le profil du projet utilisé pour l'éligibilité aux financements (âge du fondateur, prototype, immatriculation, revenus, numérique, montant levé, années d'activité, taille de l'équipe fondatrice). Les champs non renseignés restent « à vérifier ».",
    parameters: obj({ age_fondateur: N("Âge du fondateur principal"), fondatrice: B("Fondatrice ou co-fondatrice"), prototype: B("Prototype ou MVP existant"), immatriculee: B("Entreprise immatriculée"), revenus: B("Génère déjà des revenus"), numerique: B("Produit numérique"), leve_usd: N("Montant cumulé levé en USD"), annees_activite: N("Années d'activité"), taille_equipe: N("Nombre de fondateurs") }),
    async run(input, ctx) {
      const patch: Partial<EntrepreneurProfile> = { founderAge: num(input.age_fondateur), womanFounder: bool(input.fondatrice), hasPrototype: bool(input.prototype), isRegistered: bool(input.immatriculee), hasRevenue: bool(input.revenus), isDigital: bool(input.numerique), fundingRaisedUsd: num(input.leve_usd), yearsOperating: num(input.annees_activite), teamSize: num(input.taille_equipe) };
      const p = await updateProfile(ctx.companyId, patch);
      return { summary: "Profil entrepreneur à jour", data: p };
    },
  },
  {
    name: "team_definir_competences_membre",
    description: "Module Entrepreneur — enregistre les compétences d'un membre de l'équipe (sert à l'analyse des compétences manquantes).",
    parameters: obj({ membre_id: S("Identifiant du membre"), competences: A("Compétences (ex. vente, finance, développement mobile)") }, ["membre_id", "competences"]),
    async run(input, ctx) {
      const r = await setMemberSkills(ctx.companyId, str(input.membre_id), strArr(input.competences));
      return { summary: `${r.skills.length} compétence(s) enregistrée(s)`, data: r };
    },
  },
  {
    name: "idea_analyser",
    description: "Module Idée — diagnostic HONNÊTE de l'idée (pas de validation automatique) : obstacles réglementaires cités ARTICLE PAR ARTICLE depuis le corpus officiel (ou « non couvert »), indicateurs de marché issus des publications officielles, concurrents, forces, faiblesses, conditions de succès et pivots. Dis clairement les problèmes sérieux.",
    parameters: obj({ idee: S("Description de l'idée (par défaut : description de l'entreprise)"), cible: S("Clients cibles"), modele_revenus: S("Comment le projet gagne de l'argent"), concurrents: A("Concurrents connus"), differenciation: S("Ce qui distingue le projet"), enregistrer_document: B("Enregistrer le diagnostic dans Documents") }),
    async run(input, ctx, opts) {
      const d = await analyzeIdea(ctx.companyId, { idea: str(input.idee), target: str(input.cible), revenueModel: str(input.modele_revenus), competitors: strArr(input.concurrents), differentiation: str(input.differenciation) }, ctx);
      let documentId: string | undefined;
      if (bool(input.enregistrer_document)) {
        const { company } = await readModule(ctx.companyId);
        documentId = (await saveDocument(ctx.companyId, { title: `Diagnostic de l'idée — ${company.name}`, kind: "note", content: ideaMarkdown(d, company.name), needsReview: true }, opts?.actor ?? "agent")).id;
      }
      const covered = d.obstacles.filter((o) => o.status !== "non_couvert").length;
      return {
        summary: `Diagnostic : ${d.verdictLabel.split(":")[0]} (${d.score}/100) — ${d.weaknesses.length} faiblesse(s), ${covered}/${d.obstacles.length} thème(s) réglementaire(s) couvert(s) par le corpus`,
        data: { ...d, documentId, consigne: "Présente les faiblesses sans les adoucir ; cite les articles [Sx] des obstacles ; les catégories de concurrents marquées 'categorie' sont génériques, pas des entreprises réelles." },
      };
    },
  },
  {
    name: "fund_lister_programmes",
    description: "Module Financement — liste la base de programmes : programmes RÉELS vérifiés par recherche web (lien source et date de vérification) et programmes d'EXEMPLE fictifs (isExample). Types : cloud, concours, accelerateur, subvention, pret, accompagnement, investisseur.",
    parameters: obj({ type: S("Type de programme"), verifies_seulement: B("Uniquement les programmes réels vérifiés"), recherche: S("Mot-clé") }),
    async run(input) {
      const list = listPrograms({ type: str(input.type) || undefined, onlyVerified: bool(input.verifies_seulement), query: str(input.recherche) || undefined });
      return { summary: `${list.length} programme(s) (${list.filter((p) => p.verified).length} réel(s) vérifié(s), ${list.filter((p) => p.isExample).length} exemple(s))`, data: list.map((p) => ({ id: p.id, nom: p.name, organisme: p.organization, type: p.type, avantages: p.benefits, calendrier: p.lastKnownWindow ?? p.cycle, sources: p.sources, verifie_le: p.verifiedAt, exemple: p.isExample })) };
    },
  },
  {
    name: "fund_evaluer_eligibilite",
    description: "Module Financement — matching d'éligibilité du projet avec chaque programme, critère par critère (ok / ko / à vérifier) ; signale les fenêtres de candidature closes et les informations de profil manquantes.",
    parameters: obj({ type: S("Filtrer par type"), inclure_exemples: B("Inclure les programmes d'exemple (défaut : oui)") }),
    async run(input, ctx) {
      const r = await matchPrograms(ctx.companyId, { type: str(input.type) || undefined, includeExamples: bool(input.inclure_exemples) ?? true });
      const count = (v: string) => r.rows.filter((x) => x.eligibility.verdict === v).length;
      return {
        summary: `Éligibilité : ${count("eligible")} éligible(s), ${count("a_verifier")} à vérifier, ${count("non_eligible")} non éligible(s)${r.missingProfile.length ? ` — profil incomplet (${r.missingProfile.length} champ(s))` : ""}`,
        data: { profil_manquant: r.missingProfile, programmes: r.rows.map((x) => ({ id: x.program.id, nom: x.program.name, exemple: x.program.isExample, verifie_le: x.program.verifiedAt, source: x.program.sources[0], verdict: x.eligibility.verdict, score: x.eligibility.score, calendrier: x.eligibility.window, criteres: x.eligibility.results })) },
      };
    },
  },
  {
    name: "fund_preparer_dossier",
    description: "Module Financement — prépare le dossier de candidature d'un programme (auto-évaluation d'éligibilité, présentation à compléter, équipe, pièces à réunir, fondement juridique) et l'enregistre dans Documents ; crée ou met à jour le suivi de candidature.",
    parameters: obj({ programme_id: S("Identifiant du programme"), notes: S("Éléments à intégrer") }, ["programme_id"]),
    async run(input, ctx, opts) {
      const r = await prepareApplication(ctx.companyId, str(input.programme_id), ctx, str(input.notes), opts?.actor ?? "agent");
      return { summary: `Dossier « ${r.program.name} » enregistré (à compléter et valider) — verdict ${r.eligibility.verdict}`, data: { candidature: r.application, documentId: r.documentId, eligibilite: r.eligibility, fondement_juridique: r.fondement_juridique, exemple: r.program.isExample } };
    },
  },
  {
    name: "fund_suivre_candidatures",
    description: "Module Financement — liste les candidatures (statut, relances et leur état d'approbation/envoi, échéance de relance).",
    parameters: obj({}),
    async run(_input, ctx) {
      const list = await listApplications(ctx.companyId);
      return { summary: `${list.length} candidature(s), ${list.filter((a) => a.due).length} relance(s) à faire`, data: list };
    },
  },
  {
    name: "fund_mettre_a_jour_candidature",
    description: "Module Financement — met à jour une candidature : statut (a_preparer, dossier_pret, soumise, en_attente_reponse, acceptee, refusee, abandonnee), note, email de contact du programme, date de prochaine relance (AAAA-MM-JJ). Le passage à « soumise » crée un rappel de relance.",
    parameters: obj({ candidature_id: S("Identifiant"), statut: S("Nouveau statut"), note: S("Note"), email_contact: S("Email du programme"), prochaine_relance: S("AAAA-MM-JJ") }, ["candidature_id"]),
    async run(input, ctx, opts) {
      const a = await updateApplication(ctx.companyId, str(input.candidature_id), { status: str(input.statut) || undefined, note: str(input.note) || undefined, contactEmail: str(input.email_contact) || undefined, nextFollowUp: str(input.prochaine_relance) || undefined }, opts?.actor ?? "agent");
      return { summary: `Candidature « ${a.programName} » → ${a.status}`, data: a };
    },
  },
  {
    name: "fund_relancer_programme",
    description: "Module Financement — prépare un email de relance au programme pour une candidature soumise ; il est placé dans la file d'APPROBATION et ne part qu'après validation humaine.",
    external: true,
    parameters: obj({ candidature_id: S("Identifiant"), destinataire: S("Email du programme si non connu"), message: S("Corps personnalisé") }, ["candidature_id"]),
    async run(input, ctx, opts) {
      const r = await followUpApplication(ctx.companyId, str(input.candidature_id), { to: str(input.destinataire) || undefined, message: str(input.message) || undefined }, opts?.actor ?? "agent");
      return { summary: `Relance « ${r.application.programName} » en attente d'approbation`, data: r };
    },
  },
  {
    name: "team_analyser_competences",
    description: "Module Équipe — compétences requises selon le secteur, couvertes par l'équipe, compétences manquantes critiques, et profils idéaux de co-fondateurs, premiers employés ou prestataires.",
    parameters: obj({}),
    async run(_input, ctx) {
      const g = await teamGaps(ctx.companyId);
      return { summary: `${g.gaps.length} compétence(s) manquante(s) dont ${g.gaps.filter((x) => x.critical).length} critique(s) ; ${g.declaredMembers} membre(s) avec compétences déclarées`, data: g };
    },
  },
  {
    name: "team_rediger_fiche_de_poste",
    description: "Module Équipe — rédige une fiche de poste avec critères OBJECTIFS pondérés et seuil de présélection, l'enregistre dans Documents (à valider) et ouvre l'offre pour importer des candidatures. Conformité : droit du travail cité seulement s'il est dans le corpus, sinon « non couvert ». Domaines : tech, commercial, finance, juridique, operations, reseau, rh.",
    parameters: obj({ intitule: S("Intitulé du poste"), domaine: S("Domaine de compétence"), type: S("cofondateur ou employe"), seuil: N("Seuil sur 100 (défaut 60)"), annees_min: N("Expérience minimale") }),
    async run(input, ctx, opts) {
      const domain = str(input.domaine) || undefined;
      let title = str(input.intitule);
      if (!title) title = (await teamGaps(ctx.companyId)).profiles.find((p) => !domain || p.domain === domain)?.title ?? "Poste à pourvoir";
      const r = await createJob(ctx.companyId, { title, domain, kind: str(input.type) === "cofondateur" ? "cofondateur" : "employe", threshold: num(input.seuil), minYears: num(input.annees_min) }, ctx, opts?.actor ?? "agent");
      return { summary: `Fiche de poste « ${r.job.title} » enregistrée (seuil ${r.job.threshold}/100) — ${r.conformite.droit_du_travail.libelle}`, data: { offre: r.job, documentId: r.documentId, conformite: r.conformite } };
    },
  },
  {
    name: "team_importer_candidature",
    description: "Module Équipe — importe une candidature (texte du CV) pour une offre et calcule son score objectif. Déclarer toute relation personnelle (ami, famille, ancien_collegue, recommandation) et le membre qui recommande.",
    parameters: obj({ offre_id: S("Offre (défaut : la plus récente)"), nom: S("Nom du candidat"), email: S("Email"), cv_texte: S("Texte du CV"), relation: S("aucune, ami, famille, ancien_collegue, recommandation"), recommande_par: S("Identifiant du membre qui recommande") }, ["nom", "cv_texte"]),
    async run(input, ctx) {
      const c = await importCandidate(ctx.companyId, { jobId: await latestJobId(ctx.companyId, input.offre_id), name: str(input.nom), email: str(input.email) || undefined, cvText: str(input.cv_texte), relation: str(input.relation) || undefined, referredBy: str(input.recommande_par) || undefined });
      return { summary: `Candidature de ${c.name} : ${c.score}/100 → ${c.status === "retenu" ? "retenue" : "sous le seuil"}`, data: { id: c.id, score: c.score, statut: c.status, detail: c.breakdown, manquants: c.missingRequired } };
    },
  },
  {
    name: "team_filtrer_candidatures",
    description: "Module Équipe — filtre les candidatures d'une offre selon les critères objectifs et le seuil : renvoie les profils retenus (avec l'analyse collaborative de l'équipe), ceux sous le seuil (consultables) et les alertes de biais affinitaire.",
    parameters: obj({ offre_id: S("Offre (défaut : la plus récente)"), seuil: N("Nouveau seuil sur 100") }),
    async run(input, ctx) {
      const r = await screenCandidates(ctx.companyId, await latestJobId(ctx.companyId, input.offre_id), num(input.seuil));
      return { summary: `${r.retenus.length} profil(s) retenu(s), ${r.sous_seuil.length} sous le seuil de ${r.job.threshold}, ${r.alertes_biais.length} alerte(s) de biais`, data: r };
    },
  },
  {
    name: "team_noter_candidat",
    description: "Module Équipe — enregistre l'évaluation (1 à 5 + commentaire) d'un membre sur un candidat retenu (analyse collaborative). Signale un conflit d'intérêts si le membre a recommandé le candidat.",
    parameters: obj({ candidat_id: S("Identifiant du candidat"), membre_id: S("Membre évaluateur"), note: N("1 à 5"), commentaire: S("Appréciation fondée sur les critères du poste") }, ["candidat_id", "membre_id", "note"]),
    async run(input, ctx, opts) {
      const r = await reviewCandidate(ctx.companyId, { candidateId: str(input.candidat_id), memberId: str(input.membre_id), rating: num(input.note) ?? 0, notes: str(input.commentaire), via: opts?.viewerEmail === undefined ? "agent" : undefined }, opts?.viewerEmail);
      return { summary: `Évaluation enregistrée (moyenne ${r.collaboratif.average}/5)${r.alerte ? " — ⚠️ conflit d'intérêts" : ""}`, data: r };
    },
  },
  {
    name: "team_decider_candidat",
    description: "Module Équipe — enregistre une décision (a_rencontrer, ecarte, offre) ou force le passage en liste courte d'un profil sous le seuil (justification obligatoire ; jamais bloqué mais signalé dans les alertes de biais).",
    parameters: obj({ candidat_id: S("Identifiant"), decision: S("a_rencontrer, ecarte, offre"), forcer_liste_courte: B("Passer en liste courte malgré le seuil"), justification: S("Justification") }, ["candidat_id"]),
    async run(input, ctx, opts) {
      const c = await decideCandidate(ctx.companyId, { candidateId: str(input.candidat_id), decision: str(input.decision) || undefined, override: bool(input.forcer_liste_courte), reason: str(input.justification), actor: opts?.actor ?? "agent" });
      return { summary: `${c.name} : ${c.decision ?? "liste courte forcée"}`, data: c };
    },
  },
  {
    name: "team_alertes_biais",
    description: "Module Équipe — alerte de biais affinitaire : candidats du réseau personnel avancés malgré un score faible, conflits d'intérêts des évaluateurs, notes gonflées, vivier trop issu du réseau.",
    parameters: obj({ offre_id: S("Offre (défaut : la plus récente)") }),
    async run(input, ctx) {
      const jobId = await latestJobId(ctx.companyId, input.offre_id);
      const { m, data } = await readModule(ctx.companyId);
      const job = m.jobs.find((j) => j.id === jobId && j.companyId === ctx.companyId);
      if (!job) throw new WorkspaceError("Offre introuvable.", 404);
      const alerts = biasAlerts(job, m.candidates.filter((c) => c.companyId === ctx.companyId), m.reviews.filter((r) => r.companyId === ctx.companyId), data.members.filter((x) => x.companyId === ctx.companyId));
      return { summary: `${alerts.length} alerte(s) de biais pour « ${job.title} »`, data: alerts };
    },
  },
  {
    name: "team_conformite_recrutement",
    description: "Module Équipe — points de conformité du recrutement : droit du travail (cité uniquement s'il figure dans le corpus officiel, sinon « non couvert »), protection des données personnelles des candidats (corpus), bonnes pratiques anti-discrimination.",
    parameters: obj({ sujet: S("Sujet précis (ex. période d'essai, contrat)") }),
    async run(input, ctx) {
      const r = await recruitmentCompliance(ctx, str(input.sujet) || "recrutement embauche");
      const { _grounding, ...rest } = r;
      return { summary: `${r.droit_du_travail.libelle} ; données personnelles : ${basisData(_grounding).libelle}`, data: { ...rest, fondement_juridique: basisData(_grounding) } };
    },
  },
  {
    name: "mentor_rechercher",
    description: "Module Mentors — matching avec le réseau de mentors par secteur et compétences recherchées (par défaut : compétences manquantes de l'équipe). Les profils actuels sont des EXEMPLES fictifs.",
    parameters: obj({ competences: A("Compétences recherchées"), secteur: S("Secteur") }),
    async run(input, ctx) {
      const r = await matchMentors(ctx.companyId, { skills: strArr(input.competences), sector: str(input.secteur) || undefined });
      return { summary: `${r.rows.length} mentor(s) pertinent(s) (profils d'exemple)`, data: { competences_recherchees: r.skillsSought, mentors: r.rows.slice(0, 6).map((x) => ({ id: x.mentor.id, nom: x.mentor.name, titre: x.mentor.headline, lieu: x.mentor.location, score: x.score, secteurs: x.sectorHits, competences: x.skillHits, exemple: true })) } };
    },
  },
  {
    name: "mentor_demander_mise_en_relation",
    description: "Module Mentors — prépare une demande de mise en relation (email) avec un mentor ; elle est placée dans la file d'APPROBATION et ne part qu'après validation humaine.",
    external: true,
    parameters: obj({ mentor_id: S("Identifiant du mentor"), message: S("Message personnalisé") }, ["mentor_id"]),
    async run(input, ctx, opts) {
      const r = await requestIntro(ctx.companyId, { mentorId: str(input.mentor_id), message: str(input.message) || undefined }, opts?.actor ?? "agent");
      return { summary: `Demande de mise en relation avec ${r.request.mentorName} en attente d'approbation`, data: r };
    },
  },
  {
    name: "market_rechercher_partenaires",
    description: "Module Marché B2B — place de marché sur l'annuaire fournisseurs : score de compatibilité avec le besoin (services, ville, note) et de solidité (données d'EXEMPLE), classement global, fondement juridique des contrats de fourniture.",
    parameters: obj({ besoin: S("Besoin exprimé"), ville: S("Ville"), categorie: S("Catégorie"), solidite_min: N("Solidité minimale sur 100") }),
    async run(input, ctx) {
      const r = await searchMarket({ need: str(input.besoin), city: str(input.ville) || undefined, category: str(input.categorie) || undefined, minSolidity: num(input.solidite_min) }, ctx);
      return {
        summary: `${r.rows.length} partenaire(s) compatible(s)${r.fondement_juridique ? ` — ${r.fondement_juridique.libelle}` : ""}`,
        data: { avertissement: r.avertissement, fondement_juridique: r.fondement_juridique, partenaires: r.rows.slice(0, 8).map((x) => ({ id: x.supplier.id, nom: x.supplier.name, categorie: x.supplier.category, ville: x.supplier.city, compatibilite: x.compatibility, solidite: x.solidity, global: x.overall, correspondances: x.matched, exemple: x.supplier.isExample })) },
      };
    },
  },
  {
    name: "market_demander_devis",
    description: "Module Marché B2B — envoie des demandes de devis aux partenaires choisis via le flux existant : chaque email passe par la file d'APPROBATION, puis le devis est suivi dans « Fournisseurs & devis ».",
    external: true,
    parameters: obj({ partenaire_ids: A("Identifiants des partenaires"), besoin: S("Besoin"), quantite: S("Quantité"), date_souhaitee: S("Date souhaitée") }, ["partenaire_ids", "besoin"]),
    async run(input, ctx, opts) {
      const r = await requestMarketQuotes(ctx.companyId, { supplierIds: strArr(input.partenaire_ids), need: str(input.besoin), quantity: str(input.quantite) || undefined, desiredDate: str(input.date_souhaitee) || undefined }, ctx, opts?.actor ?? "agent");
      return { summary: `${r.created.length} demande(s) de devis en attente d'approbation — ${r.fondement_juridique.libelle}`, data: { devis: r.created.map((c) => ({ devis: c.quote.id, partenaire: c.supplier, approbation: c.approvalId })), fondement_juridique: r.fondement_juridique } };
    },
  },
];

export const ENTREPRENEUR_TOOL_MAP = new Map(ENTREPRENEUR_TOOLS.map((t) => [t.name, t]));

/** Instantané du module pour l'UI (calculs rapides, sans recherche juridique). */
export async function entrepreneurSnapshot(companyId: string) {
  const { m, data, company } = await readModule(companyId);
  const members = data.members.filter((x) => x.companyId === companyId);
  const jobs = m.jobs.filter((j) => j.companyId === companyId);
  const reviews = m.reviews.filter((r) => r.companyId === companyId);
  const candidates = m.candidates.filter((c) => c.companyId === companyId);
  const gaps = await teamGaps(companyId);
  const matches = await matchPrograms(companyId);
  return {
    company,
    profile: m.profiles.find((p) => p.companyId === companyId) ?? null,
    missingProfile: matches.missingProfile,
    ideas: m.ideas.filter((i) => i.companyId === companyId).slice(0, 5),
    programs: matches.rows,
    applications: await listApplications(companyId),
    team: gaps,
    jobs: jobs.map((j) => ({ ...j, alerts: biasAlerts(j, candidates, reviews, members), count: candidates.filter((c) => c.jobId === j.id).length })),
    candidates: candidates.map(({ cvText, ...c }) => ({ ...c, extrait: cvText.slice(0, 400), reviews: reviews.filter((r) => r.candidateId === c.id) })),
    mentors: await matchMentors(companyId),
    mentorCatalog: SEED_MENTORS,
    mentorRequests: m.mentorRequests.filter((r) => r.companyId === companyId).map((r) => ({ ...r, approvalStatus: data.approvals.find((a) => a.id === r.approvalId)?.status ?? "inconnu", emailStatus: data.emails.find((e) => e.id === r.emailId)?.status ?? "inconnu" })),
    members,
  };
}

export type EntrepreneurSnapshot = Awaited<ReturnType<typeof entrepreneurSnapshot>>;

/** Exécution depuis l'API : contexte de citations propre à la requête. */
export async function runEntrepreneurAction(name: string, companyId: string, input: Record<string, unknown>, opts: ActionOptions) {
  const tool = ENTREPRENEUR_TOOL_MAP.get(name);
  if (!tool) throw new WorkspaceError("Action inconnue.", 404);
  const ctx: Ctx = { companyId, citations: [], groundings: [] };
  const result = await tool.run(input, ctx, opts);
  return { ...result, citations: ctx.citations };
}

