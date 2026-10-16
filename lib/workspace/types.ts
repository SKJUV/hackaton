/**
 * Modèle de données du workspace entreprise.
 * Toute donnée marquée `isExample: true` est un seed de démonstration (non officiel).
 */

export type Role = "proprietaire" | "admin" | "membre" | "lecteur";

export type Company = {
  id: string;
  name: string;
  sector: string;
  /** Mots-clés sectoriels utilisés par la veille réglementaire. */
  sectorKeywords: string[];
  legalForm: string;
  city: string;
  country: string;
  stage: "idee" | "creation" | "lancement" | "croissance";
  description: string;
  capital?: number;
  currency: string;
  createdAt: string;
  isExample?: boolean;
};

export type Member = {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
};

export type DocumentKind =
  | "business_plan"
  | "roadmap"
  | "statuts"
  | "contrat"
  | "note"
  | "pv"
  | "import";

export type WorkspaceDocument = {
  id: string;
  companyId: string;
  title: string;
  kind: DocumentKind;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Document généré à partir d'un modèle : à faire valider par un professionnel. */
  needsReview?: boolean;
};

export type TaskStatus = "a_faire" | "en_cours" | "fait";
export type Task = {
  id: string;
  companyId: string;
  title: string;
  description?: string;
  dueDate?: string;
  status: TaskStatus;
  source: "agent" | "utilisateur" | "calendrier" | "relance";
  relatedType?: "devis" | "email" | "demarche" | "obligation";
  relatedId?: string;
  assigneeId?: string;
  createdAt: string;
};

export type Supplier = {
  id: string;
  name: string;
  category: string;
  services: string[];
  city: string;
  email: string;
  phone: string;
  rating: number;
  description: string;
  isExample: boolean;
};

export type QuoteStatus =
  | "en_attente_approbation"
  | "envoyee"
  | "reponse_recue"
  | "acceptee"
  | "refusee"
  | "annulee";

export type QuoteRequest = {
  id: string;
  companyId: string;
  supplierId: string;
  need: string;
  quantity?: string;
  desiredDate?: string;
  status: QuoteStatus;
  emailId: string;
  followUpCount: number;
  lastContactAt?: string;
  response?: { amount: number; currency: string; delayDays: number; note: string; receivedAt: string; simulated: boolean };
  createdAt: string;
};

export type EmailStatus = "brouillon" | "en_attente_approbation" | "envoye" | "simule" | "echec" | "rejete";
export type Email = {
  id: string;
  companyId: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  status: EmailStatus;
  provider?: string;
  providerMessageId?: string;
  error?: string;
  relatedType?: "devis" | "relance" | "libre";
  relatedId?: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
};

export type ApprovalType = "envoi_email" | "demande_devis" | "relance_fournisseur";
export type ApprovalStatus = "en_attente" | "approuvee" | "rejetee";
export type Approval = {
  id: string;
  companyId: string;
  type: ApprovalType;
  title: string;
  summary: string;
  emailId: string;
  quoteId?: string;
  status: ApprovalStatus;
  requestedBy: string;
  decidedBy?: string;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
};

export type ActivityEntry = {
  id: string;
  companyId: string;
  actor: string;
  action: string;
  details: string;
  createdAt: string;
};

export type StepStatus = "a_faire" | "en_cours" | "fait" | "bloque";
export type ChecklistStep = {
  id: string;
  companyId: string;
  order: number;
  title: string;
  description: string;
  authority: string;
  documents: string[];
  status: StepStatus;
  note?: string;
  isExample: boolean;
  updatedAt: string;
};

export type Obligation = {
  id: string;
  companyId: string;
  title: string;
  category: "fiscal" | "social" | "sectoriel" | "juridique";
  dueDate: string;
  recurrence: "mensuel" | "trimestriel" | "annuel" | "unique";
  description: string;
  done: boolean;
  isExample: boolean;
};

export type AgentMessage = {
  id: string;
  companyId: string;
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTrace[];
  mode?: "llm" | "demo";
  createdAt: string;
};

export type ToolTrace = {
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  ok: boolean;
};

export type WorkspaceData = {
  version: number;
  companies: Company[];
  members: Member[];
  documents: WorkspaceDocument[];
  tasks: Task[];
  suppliers: Supplier[];
  quotes: QuoteRequest[];
  emails: Email[];
  approvals: Approval[];
  activity: ActivityEntry[];
  checklist: ChecklistStep[];
  obligations: Obligation[];
  messages: AgentMessage[];
};
