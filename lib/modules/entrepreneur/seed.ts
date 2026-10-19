/** Jeu d'EXEMPLE du module pour les entreprises de démonstration (profils et CV fictifs). */
import { scoreCandidate } from "./scoring";
import type { Candidate, CandidateReview, EntrepreneurData, JobOpening } from "./types";

const DEMO_CVS: { name: string; relation: Candidate["relation"]; referredBy?: string; decision?: Candidate["decision"]; cv: string }[] = [
  { name: "Brice T. (exemple)", relation: "aucune", cv: "Développeur mobile senior. 6 ans d'expérience en développement Android et Flutter, back-end Node.js et API REST avec PostgreSQL. Lancement en production d'une application de livraison (40 000 utilisateurs), géolocalisation temps réel, intégration paiement mobile money. Sécurité : authentification et chiffrement." },
  { name: "Laure N. (exemple)", relation: "aucune", cv: "Ingénieure logiciel, 4 ans d'expérience. React et React Native, API Python, base de données MySQL. Déploiement d'applications web pour des PME, encadrement de deux stagiaires." },
  { name: "Hervé M. (exemple)", relation: "ami", referredBy: "mem_freddy", decision: "a_rencontrer", cv: "Passionné d'informatique, ancien camarade de promotion. Maintenance de parc informatique pendant 2 ans, création de sites vitrines WordPress. Bonne connaissance des réseaux sociaux." },
  { name: "Estelle K. (exemple)", relation: "aucune", cv: "Chargée de projet digital, 3 ans d'expérience : gestion de campagnes marketing, coordination de prestataires web, reporting." },
];

/**
 * Seed du module (convention moduleState) : éléments de DÉMO pour co_kmerlog / co_afritel, tous marqués exemple.
 * « Réinitialiser la démo » efface ces éléments et ré-applique ce seed (les vraies entreprises sont conservées).
 */
export function seedEntrepreneur(): EntrepreneurData {
  const now = new Date().toISOString();
  const m: EntrepreneurData = { profiles: [], ideas: [], applications: [], jobs: [], candidates: [], reviews: [], memberSkills: [], mentorRequests: [] };
  const co = "co_kmerlog";
  m.profiles.push({ companyId: co, hasPrototype: true, isRegistered: false, hasRevenue: false, isDigital: true, fundingRaisedUsd: 0, yearsOperating: 0, teamSize: 3, updatedAt: now });
  const skills: Record<string, string[]> = { mem_freddy: ["vente", "partenariats commerciaux", "marketing"], mem_awa: ["finance", "comptabilité", "levée de fonds"], mem_paul: ["livraison terrain", "logistique"] };
  for (const [memberId, list] of Object.entries(skills)) m.memberSkills.push({ companyId: co, memberId, skills: list });
  const job: JobOpening = {
    id: `job_${co}_cto`,
    companyId: co,
    title: "Responsable technique (CTO) — co-fondateur·rice (exemple)",
    kind: "cofondateur",
    minYears: 3,
    threshold: 60,
    isExample: true,
    createdAt: now,
    criteria: [
      { label: "Développement mobile", keywords: ["android", "flutter", "react native", "mobile"], weight: 30, required: true },
      { label: "Back-end & API", keywords: ["node", "api", "backend", "postgresql", "base de donnees"], weight: 25, required: false },
      { label: "Géolocalisation & temps réel", keywords: ["geolocalisation", "gps", "temps reel", "cartographie"], weight: 15, required: false },
      { label: "Paiement mobile", keywords: ["mobile money", "paiement", "orange money", "momo"], weight: 10, required: false },
    ],
  };
  m.jobs.push(job);
  for (const [i, c] of DEMO_CVS.entries()) {
    const s = scoreCandidate(job, c.cv, c.name);
    m.candidates.push({ id: `cand_${co}_${i + 1}`, companyId: co, jobId: job.id, name: c.name, cvText: c.cv, source: "seed", relation: c.relation, referredBy: c.referredBy, decision: c.decision, isExample: true, createdAt: now, ...s });
  }
  const reviews: CandidateReview[] = [
    { id: "rev_seed_1", companyId: co, candidateId: `cand_${co}_1`, memberId: "mem_awa", memberName: "Awa Mbarga (démo)", rating: 4, notes: "Expérience très proche de notre besoin (livraison + mobile money).", createdAt: now },
    { id: "rev_seed_2", companyId: co, candidateId: `cand_${co}_3`, memberId: "mem_freddy", memberName: "Freddy Choudja", rating: 5, notes: "Je le connais bien, très motivé.", createdAt: now },
    { id: "rev_seed_3", companyId: co, candidateId: `cand_${co}_1`, memberId: "mem_paul", memberName: "Paul Etoa (démo)", rating: 2, notes: "Profil très technique, à voir sur le terrain.", createdAt: now },
  ];
  m.reviews.push(...reviews);
  m.profiles.push({ companyId: "co_afritel", hasPrototype: false, isRegistered: false, hasRevenue: false, isDigital: true, yearsOperating: 0, teamSize: 1, updatedAt: now });
  m.memberSkills.push({ companyId: "co_afritel", memberId: "mem_freddy2", skills: ["commercial", "gestion de projet"] });
  return m;
}
