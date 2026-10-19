/**
 * Module « Entrepreneur » (niveau 1 du co-fondateur) — modèle de données.
 * Les données sont rangées dans le store JSON existant, sous la clé optionnelle `entrepreneur`
 * (aucune migration : la clé est créée à la première écriture).
 * Toute entrée `isExample: true` est un seed de démonstration, jamais présenté comme réel.
 */
import type { Citation } from "@/lib/legal/citations";
import type { Grounding } from "@/lib/legal/grounding";

export type Ctx = { companyId: string; citations: Citation[]; groundings?: Grounding[] };

export type Tri = "ok" | "ko" | "a_verifier";

/** Profil du projet utilisé pour l'éligibilité (inconnu = « à vérifier », jamais supposé). */
export type EntrepreneurProfile = {
  companyId: string;
  founderAge?: number;
  /** Fondatrice ou co-fondatrice (prix féminins) — déclaratif et facultatif. */
  womanFounder?: boolean;
  hasPrototype?: boolean;
  isRegistered?: boolean;
  hasRevenue?: boolean;
  isDigital?: boolean;
  /** Montant cumulé levé (USD), 0 si autofinancé. */
  fundingRaisedUsd?: number;
  /** Années d'activité ; à défaut calculé depuis la date de création du workspace. */
  yearsOperating?: number;
  teamSize?: number;
  updatedAt: string;
};

export type IdeaInput = {
  idea: string;
  target?: string;
  revenueModel?: string;
  competitors?: string[];
  differentiation?: string;
};

export type ArticleRow = { source: string; document: string; page: number; article: string; extrait: string; file: string };

export type RegulatoryTheme = {
  theme: string;
  query: string;
  status: "fonde" | "partiel" | "non_couvert";
  label: string;
  articles: ArticleRow[];
};

export type IdeaDiagnostic = {
  id: string;
  companyId: string;
  input: IdeaInput;
  score: number;
  verdict: "fragile" | "a_consolider" | "prometteuse_sous_conditions";
  verdictLabel: string;
  strengths: string[];
  weaknesses: string[];
  obstacles: RegulatoryTheme[];
  market: { indicators: { source: string; document: string; page: number; extrait: string; category: string }[]; note: string };
  competitors: { name: string; kind: "declare" | "web" | "categorie"; detail: string; url?: string }[];
  competitorsMode: "web" | "demo";
  successConditions: string[];
  pivots: string[];
  createdAt: string;
};

export type FundingApplicationStatus = "a_preparer" | "dossier_pret" | "soumise" | "en_attente_reponse" | "acceptee" | "refusee" | "abandonnee";

export type FundingApplication = {
  id: string;
  companyId: string;
  programId: string;
  programName: string;
  status: FundingApplicationStatus;
  documentId?: string;
  submittedAt?: string;
  nextFollowUp?: string;
  contactEmail?: string;
  followUps: { emailId: string; approvalId: string; createdAt: string }[];
  notes: string[];
  createdAt: string;
  updatedAt: string;
};

export type JobCriterion = { label: string; keywords: string[]; weight: number; required: boolean };

export type JobOpening = {
  id: string;
  companyId: string;
  title: string;
  kind: "cofondateur" | "employe";
  criteria: JobCriterion[];
  minYears: number;
  threshold: number;
  documentId?: string;
  isExample?: boolean;
  createdAt: string;
};

export type Relation = "aucune" | "ami" | "famille" | "ancien_collegue" | "recommandation";

export type Candidate = {
  id: string;
  companyId: string;
  jobId: string;
  name: string;
  email?: string;
  cvText: string;
  source: "texte" | "pdf" | "seed";
  relation: Relation;
  referredBy?: string;
  score: number;
  breakdown: { label: string; matched: string[]; points: number; max: number; required: boolean }[];
  years: number | null;
  missingRequired: string[];
  status: "retenu" | "sous_seuil";
  /** Passage manuel en liste courte malgré le seuil (jamais bloqué, mais signalé). */
  override?: { by: string; reason: string; at: string };
  decision?: "a_rencontrer" | "ecarte" | "offre";
  isExample?: boolean;
  createdAt: string;
};

export type CandidateReview = {
  id: string;
  companyId: string;
  candidateId: string;
  memberId: string;
  memberName: string;
  rating: number;
  notes: string;
  createdAt: string;
};

export type MemberSkills = { companyId: string; memberId: string; skills: string[] };

export type MentorRequest = {
  id: string;
  companyId: string;
  mentorId: string;
  mentorName: string;
  message: string;
  emailId: string;
  approvalId: string;
  createdAt: string;
};

export type EntrepreneurData = {
  profiles: EntrepreneurProfile[];
  ideas: IdeaDiagnostic[];
  applications: FundingApplication[];
  jobs: JobOpening[];
  candidates: Candidate[];
  reviews: CandidateReview[];
  memberSkills: MemberSkills[];
  mentorRequests: MentorRequest[];
};
