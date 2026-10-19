/**
 * Module « memoire » : mémoire organisationnelle, salle de réunion intelligente,
 * Score Co-founder signé (Ed25519) et mode bas débit / vocal.
 * Toute donnée `isExample: true` est un seed de démonstration (non officiel).
 */
import type { GroundingStatus } from "@/lib/legal/grounding";

/** Article(s) de loi trouvés dans le corpus AU MOMENT de la décision (instantané figé, jamais recalculé). */
export type LegalSnapshot = {
  query: string;
  status: GroundingStatus;
  label: string;
  capturedAt: string;
  sources: { document: string; page: number; articles: string[]; file: string; isExample: boolean; excerpt: string }[];
};

export type SourceRef = {
  type: "document" | "email" | "reunion" | "journal" | "message" | "decision" | "tache";
  id: string;
  label: string;
};

export type DecisionStatus = "proposee" | "adoptee" | "revisee" | "abandonnee";

export type Decision = {
  id: string;
  companyId: string;
  title: string;
  decision: string;
  rationale: string;
  alternatives: string[];
  status: DecisionStatus;
  decidedAt: string;
  decidedBy: string;
  sources: SourceRef[];
  legal: LegalSnapshot;
  meetingId?: string;
  taskIds: string[];
  tags: string[];
  isExample?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MeetingAction = { title: string; assigneeId?: string; assigneeName?: string; dueDate?: string; taskId?: string };

export type MeetingAnalysis = {
  summary: string;
  keyPoints: string[];
  decisions: { title: string; rationale: string; line?: number }[];
  actions: (MeetingAction & { line?: number })[];
  mode: "llm" | "demo";
  provider?: string;
};

export type Meeting = {
  id: string;
  companyId: string;
  title: string;
  date: string;
  participants: string[];
  transcript: string;
  source: "texte" | "audio" | "dictee";
  transcription?: { provider: string; demo: boolean };
  status: "en_cours" | "terminee";
  analysis?: MeetingAnalysis;
  decisionIds: string[];
  taskIds: string[];
  pvDocumentId?: string;
  isExample?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ScoreComponent = {
  key: "delais" | "engagements" | "objectifs" | "decisions";
  label: string;
  weight: number;
  /** null : aucune donnée évaluable pour ce critère (exclu de la moyenne). */
  score: number | null;
  evidence: Record<string, number>;
  explanation: string;
};

export type ScoreResult = {
  score: number;
  level: "insuffisant" | "en_construction" | "fiable" | "tres_fiable";
  components: ScoreComponent[];
  methodologyVersion: string;
  computedAt: string;
  dataPoints: number;
};

export type AttestationPayload = {
  type: "cofounder-score";
  v: 1;
  id: string;
  company: { id: string; name: string; sector: string; isExample: boolean };
  score: number;
  level: ScoreResult["level"];
  components: { key: string; label: string; weight: number; score: number | null; evidence: Record<string, number> }[];
  methodologyVersion: string;
  computedAt: string;
  issuedAt: string;
  expiresAt: string;
  keyId: string;
  demo: boolean;
};

export type Attestation = {
  id: string;
  companyId: string;
  payload: AttestationPayload;
  /** Signature Ed25519 (base64url) de la forme canonique du payload. */
  signature: string;
  publicKeyPem: string;
  keySource: "env" | "dev";
  issuedBy: string;
  revokedAt?: string;
  createdAt: string;
};

export type MemoireData = {
  decisions: Decision[];
  meetings: Meeting[];
  attestations: Attestation[];
  /** Entreprises de démo dont le seed mémoire a déjà été injecté. */
  seeded: string[];
};
