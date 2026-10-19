/**
 * Recrutement — fonctions PURES (testables) : compétences manquantes, score objectif des candidatures,
 * analyse collaborative et alertes de biais affinitaire.
 * Le score n'utilise QUE le contenu professionnel du CV : nom, email, âge, genre, origine ou photo
 * ne sont jamais lus (le nom et l'email sont retirés du texte avant l'analyse).
 */
import type { Company, Member } from "@/lib/workspace/types";
import type { Candidate, CandidateReview, JobCriterion, JobOpening, MemberSkills, Relation } from "./types";
import { hasKeyword, norm } from "./util";

export type SkillDomain = { id: string; label: string; keywords: string[] };

export const SKILL_DOMAINS: SkillDomain[] = [
  { id: "tech", label: "Technique & produit", keywords: ["developpement", "developpeur", "technique", "produit", "cto", "logiciel", "mobile", "web", "data", "programmation", "react", "node", "flutter", "android", "backend"] },
  { id: "commercial", label: "Commercial & marketing", keywords: ["vente", "ventes", "commercial", "marketing", "acquisition", "business development", "partenariats", "negociation", "marque"] },
  { id: "finance", label: "Finance & gestion", keywords: ["finance", "comptabilite", "levee de fonds", "modele financier", "tresorerie", "controle de gestion", "audit"] },
  { id: "juridique", label: "Juridique & conformité", keywords: ["juridique", "conformite", "reglementaire", "droit", "licences", "juriste", "contrats"] },
  { id: "operations", label: "Opérations", keywords: ["operations", "logistique", "flotte", "supply chain", "approvisionnement", "exploitation", "terrain", "livraison"] },
  { id: "rh", label: "Ressources humaines & management", keywords: ["recrutement", "rh", "ressources humaines", "management", "formation"] },
  { id: "reseau", label: "Ingénierie réseau & télécoms", keywords: ["reseau", "reseaux", "telecom", "telecommunications", "radio", "fibre", "frequences", "infrastructure"] },
];

const domain = (id: string) => SKILL_DOMAINS.find((d) => d.id === id)!;

/** Compétences requises et criticité selon le secteur (règles explicites, ajustables). */
export function requiredDomains(company: Pick<Company, "sector" | "sectorKeywords" | "description">): { id: string; critical: boolean; why: string }[] {
  const text = `${company.sector} ${company.sectorKeywords.join(" ")} ${company.description}`;
  const has = (...k: string[]) => k.some((x) => hasKeyword(text, x));
  const logistics = has("livraison", "colis", "courrier", "logistique", "transport", "postal");
  const telecom = has("internet", "telecommunications", "communications electroniques", "frequences", "reseau");
  const fintech = has("paiement", "mobile money", "fintech", "credit", "monnaie electronique");
  const digital = has("application", "plateforme", "logiciel", "en ligne", "numerique", "commerce electronique", "suivi", "internet");
  const regulated = logistics || telecom || fintech;
  const out = [
    { id: "tech", critical: digital, why: digital ? "Le produit repose sur une application ou une plateforme." : "Utile pour outiller l'activité." },
    { id: "commercial", critical: true, why: "Aucune start-up ne survit sans acquisition de clients." },
    { id: "finance", critical: fintech, why: fintech ? "Activité financière : modèle et conformité financière centraux." : "Trésorerie et levée de fonds." },
    { id: "juridique", critical: regulated, why: regulated ? "Activité réglementée : titres et obligations sectorielles." : "Contrats et conformité de base." },
    { id: "operations", critical: logistics, why: logistics ? "La qualité d'exécution (flotte, délais) fait la promesse client." : "Organisation et exécution." },
  ];
  if (telecom) out.push({ id: "reseau", critical: true, why: "Déploiement et exploitation d'un réseau." });
  return out;
}

export function coveredDomains(skills: string[]): string[] {
  const text = skills.join(" ; ");
  return SKILL_DOMAINS.filter((d) => d.keywords.some((k) => hasKeyword(text, k))).map((d) => d.id);
}

export function skillGaps(company: Company, members: Member[], memberSkills: MemberSkills[]) {
  const req = requiredDomains(company);
  const byMember = members.map((m) => {
    const skills = memberSkills.find((s) => s.memberId === m.id)?.skills ?? [];
    return { memberId: m.id, name: m.name, role: m.role, skills, domains: coveredDomains(skills) };
  });
  const rows = req.map((r) => {
    const holders = byMember.filter((m) => m.domains.includes(r.id)).map((m) => m.name);
    return { domain: r.id, label: domain(r.id).label, critical: r.critical, why: r.why, covered: holders.length > 0, holders };
  });
  const declared = byMember.filter((m) => m.skills.length).length;
  return { members: byMember, rows, gaps: rows.filter((r) => !r.covered), declaredMembers: declared };
}

export type KeyProfile = {
  domain: string;
  title: string;
  kind: "cofondateur" | "employe" | "prestataire";
  why: string;
  missions: string[];
  criteria: JobCriterion[];
  minYears: number;
};

const PROFILE_TEMPLATES: Record<string, Omit<KeyProfile, "domain" | "kind" | "why">> = {
  tech: { title: "Responsable technique (CTO)", missions: ["Concevoir et livrer le produit (application, back-office)", "Choisir l'architecture et la sécurité", "Recruter et encadrer les premiers développeurs"], minYears: 3, criteria: [
    { label: "Développement mobile ou web", keywords: ["mobile", "android", "flutter", "react", "web"], weight: 30, required: true },
    { label: "Back-end & bases de données", keywords: ["backend", "api", "node", "postgres", "base de donnees", "java", "python"], weight: 25, required: false },
    { label: "Livraison d'un produit en production", keywords: ["production", "deploiement", "lancement", "utilisateurs"], weight: 15, required: false },
    { label: "Sécurité & données", keywords: ["securite", "chiffrement", "donnees personnelles", "authentification"], weight: 10, required: false },
  ] },
  commercial: { title: "Responsable commercial & partenariats", missions: ["Signer les premiers clients et partenaires", "Structurer le pipeline de vente", "Mesurer l'acquisition et la fidélisation"], minYears: 3, criteria: [
    { label: "Vente B2B ou B2C", keywords: ["vente", "ventes", "commercial", "clients", "prospection"], weight: 30, required: true },
    { label: "Négociation & partenariats", keywords: ["negociation", "partenariats", "contrats", "grands comptes"], weight: 20, required: false },
    { label: "Marketing & acquisition", keywords: ["marketing", "acquisition", "reseaux sociaux", "campagne"], weight: 15, required: false },
  ] },
  finance: { title: "Responsable administratif & financier", missions: ["Tenir la trésorerie et le reporting", "Préparer les dossiers de financement", "Piloter les obligations déclaratives avec le comptable"], minYears: 3, criteria: [
    { label: "Finance & comptabilité", keywords: ["finance", "comptabilite", "tresorerie", "budget"], weight: 30, required: true },
    { label: "Modélisation & levée de fonds", keywords: ["modele financier", "levee de fonds", "investisseurs", "business plan"], weight: 20, required: false },
  ] },
  juridique: { title: "Juriste / conseil en conformité", missions: ["Suivre les titres et autorisations sectoriels", "Rédiger et revoir les contrats", "Tenir le registre de conformité"], minYears: 2, criteria: [
    { label: "Droit des affaires & contrats", keywords: ["juridique", "droit", "contrats", "juriste"], weight: 30, required: true },
    { label: "Réglementation sectorielle", keywords: ["reglementaire", "conformite", "licences", "regulation"], weight: 20, required: false },
  ] },
  operations: { title: "Responsable des opérations", missions: ["Organiser l'exécution quotidienne (flotte, tournées, stocks)", "Suivre la qualité de service et les délais", "Recruter et former les équipes terrain"], minYears: 3, criteria: [
    { label: "Logistique & opérations", keywords: ["logistique", "operations", "flotte", "livraison", "supply chain"], weight: 30, required: true },
    { label: "Encadrement d'équipes terrain", keywords: ["equipe", "management", "encadrement", "chefs d'equipe"], weight: 20, required: false },
    { label: "Indicateurs & qualité", keywords: ["indicateurs", "kpi", "qualite", "delais"], weight: 10, required: false },
  ] },
  reseau: { title: "Ingénieur réseaux & télécoms", missions: ["Concevoir et déployer le réseau", "Préparer les dossiers techniques des autorisations", "Superviser l'exploitation et la qualité de service"], minYears: 4, criteria: [
    { label: "Ingénierie réseau", keywords: ["reseau", "reseaux", "telecom", "radio", "fibre"], weight: 30, required: true },
    { label: "Exploitation & qualité de service", keywords: ["exploitation", "supervision", "qualite de service", "noc"], weight: 20, required: false },
  ] },
  rh: { title: "Responsable RH", missions: ["Structurer le recrutement", "Mettre en place l'intégration et la formation"], minYears: 3, criteria: [
    { label: "Recrutement", keywords: ["recrutement", "rh", "ressources humaines"], weight: 30, required: true },
  ] },
};

/** Profils de co-fondateurs et premiers employés à partir des écarts. */
export function keyProfiles(gaps: { domain: string; critical: boolean; why: string }[]): KeyProfile[] {
  return gaps.map((g) => {
    const t = PROFILE_TEMPLATES[g.domain] ?? PROFILE_TEMPLATES.rh;
    const kind: KeyProfile["kind"] = g.domain === "juridique" ? "prestataire" : g.critical && ["tech", "commercial", "operations", "finance", "reseau"].includes(g.domain) ? "cofondateur" : "employe";
    return { domain: g.domain, kind, why: g.why, ...t, title: kind === "cofondateur" ? `${t.title} — co-fondateur·rice` : kind === "prestataire" ? `${t.title} (prestataire au démarrage)` : t.title };
  });
}

/* ------------------------------------------------------------ Score des CV */

const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:ans|annees|years?)\b/g;

export function extractYears(cv: string): number | null {
  const t = norm(cv);
  let best: number | null = null;
  for (const m of t.matchAll(YEARS_RE)) {
    const around = t.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 40);
    if (!/experience|exp\.|depuis|pendant|dont/.test(around)) continue;
    const n = Number(m[1]);
    if (n <= 45) best = Math.max(best ?? 0, n);
  }
  return best;
}

/** Retire du texte les éléments d'identité pour que le score reste aveugle. */
export function anonymize(cv: string, name: string, email?: string): string {
  let t = cv;
  if (email) t = t.split(email).join(" ");
  for (const part of name.split(/\s+/).filter((p) => p.length > 2 && !/^\(|exemple/i.test(p))) t = t.replace(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  return t.replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, " ").replace(/\+?\d[\d\s.-]{7,}\d/g, " ");
}

export function scoreCandidate(job: Pick<JobOpening, "criteria" | "minYears" | "threshold">, cvText: string, name: string, email?: string) {
  const text = anonymize(cvText, name, email);
  const breakdown: Candidate["breakdown"] = job.criteria.map((c) => {
    const matched = c.keywords.filter((k) => hasKeyword(text, k));
    const fraction = Math.min(1, matched.length / Math.max(1, Math.min(2, c.keywords.length)));
    return { label: c.label, matched, points: Math.round(c.weight * fraction), max: c.weight, required: c.required };
  });
  const years = extractYears(text);
  if (job.minYears > 0) {
    const max = 20;
    breakdown.push({ label: `Expérience ≥ ${job.minYears} an(s)`, matched: years === null ? [] : [`${years} an(s) indiqué(s)`], points: years === null ? 0 : Math.round(max * Math.min(1, years / job.minYears)), max, required: false });
  }
  const total = breakdown.reduce((s, b) => s + b.max, 0) || 1;
  const score = Math.round((100 * breakdown.reduce((s, b) => s + b.points, 0)) / total);
  const missingRequired = breakdown.filter((b) => b.required && b.points === 0).map((b) => b.label);
  const status: Candidate["status"] = score >= job.threshold && !missingRequired.length ? "retenu" : "sous_seuil";
  return { score, breakdown, years, missingRequired, status };
}

/* ------------------------------------------- Analyse collaborative & biais */

export function collaborative(candidate: Candidate, reviews: CandidateReview[]) {
  const mine = reviews.filter((r) => r.candidateId === candidate.id);
  const avg = mine.length ? Math.round((mine.reduce((s, r) => s + r.rating, 0) / mine.length) * 10) / 10 : null;
  const spread = mine.length > 1 ? Math.max(...mine.map((r) => r.rating)) - Math.min(...mine.map((r) => r.rating)) : 0;
  return { reviews: mine, average: avg, spread, divergence: spread >= 2, scoreObjectif: candidate.score };
}

export const RELATION_LABEL: Record<Relation, string> = { aucune: "aucune", ami: "ami·e", famille: "famille", ancien_collegue: "ancien·ne collègue", recommandation: "recommandation personnelle" };

export type BiasAlert = { level: "attention" | "alerte"; candidateId?: string; message: string; advice: string };

export function biasAlerts(job: JobOpening, candidates: Candidate[], reviews: CandidateReview[], members: Member[]): BiasAlert[] {
  const list = candidates.filter((c) => c.jobId === job.id);
  const alerts: BiasAlert[] = [];
  const memberName = (id?: string) => members.find((m) => m.id === id)?.name ?? "un membre";
  for (const c of list) {
    const related = c.relation !== "aucune";
    const advanced = Boolean(c.override) || c.decision === "a_rencontrer" || c.decision === "offre";
    if (related && advanced && c.status === "sous_seuil") {
      alerts.push({ level: "alerte", candidateId: c.id, message: `${c.name} (${RELATION_LABEL[c.relation]}) est avancé·e alors que son score objectif est ${c.score}/100, sous le seuil de ${job.threshold}.`, advice: "Justifiez la décision par des critères du poste ou évaluez-le·la au même titre que les autres candidats." });
    }
    if (related) {
      const better = list.filter((o) => o.relation === "aucune" && o.status === "retenu" && o.score > c.score && !o.decision);
      if (advanced && better.length) alerts.push({ level: "attention", candidateId: c.id, message: `${better.length} candidat·e(s) sans lien personnel et mieux noté·e(s) (${better.map((b) => `${b.name} ${b.score}`).join(", ")}) n'ont pas encore été examiné·e(s).`, advice: "Examinez d'abord les profils les mieux classés objectivement." });
    }
    for (const r of reviews.filter((x) => x.candidateId === c.id)) {
      if (c.referredBy && r.memberId === c.referredBy) {
        alerts.push({ level: "alerte", candidateId: c.id, message: `Conflit d'intérêts : ${r.memberName} évalue ${c.name}, qu'il·elle a recommandé·e.`, advice: "Récusation conseillée : laissez un autre membre évaluer ce profil." });
      }
    }
    const collab = collaborative(c, reviews);
    if (related && collab.average !== null && collab.average * 20 - c.score >= 25) {
      alerts.push({ level: "attention", candidateId: c.id, message: `Notes de l'équipe (${collab.average}/5) nettement supérieures au score objectif (${c.score}/100) pour un profil avec lien personnel.`, advice: "Vérifiez que l'appréciation repose sur les critères du poste." });
    }
  }
  const pool = list.filter((c) => c.status === "retenu" || c.decision === "a_rencontrer" || c.decision === "offre" || c.override);
  const fromNetwork = pool.filter((c) => c.relation !== "aucune");
  if (pool.length >= 2 && fromNetwork.length / pool.length > 0.5) {
    alerts.push({ level: "attention", message: `${fromNetwork.length}/${pool.length} profils avancés viennent du réseau personnel de l'équipe (${fromNetwork.map((c) => `${c.name} : ${RELATION_LABEL[c.relation]}${c.referredBy ? `, via ${memberName(c.referredBy)}` : ""}`).join(" ; ")}).`, advice: "Élargissez le sourcing (annonces publiques, écoles, plateformes) pour comparer à compétences égales." });
  }
  return alerts;
}
