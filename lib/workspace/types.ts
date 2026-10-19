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
/** Canal de l'action externe. Hors email, l'envoi est toujours simulé tant qu'un connecteur réel n'est pas branché. */
export type MessageChannel = "email" | "whatsapp" | "sms" | (string & {});
export type Email = {
  id: string;
  companyId: string;
  channel?: MessageChannel;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  status: EmailStatus;
  provider?: string;
  providerMessageId?: string;
  error?: string;
  relatedType?: "devis" | "relance" | "libre" | (string & {});
  relatedId?: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
};

/** Types d'approbation : les modules peuvent en ajouter (chaîne libre, préfixée par le module, ex. "fund_relance"). */
export type ApprovalType = "envoi_email" | "demande_devis" | "relance_fournisseur" | (string & {});

/** Feu vert juridique : vérification de l'action externe contre le corpus officiel, affichée dans la carte d'approbation. */
export type LegalCheck = {
  status: "fonde" | "partiel" | "non_couvert";
  label: string;
  query: string;
  sources: { id: string; document: string; page: number; articles: string[]; file: string; isExample: boolean }[];
  checkedAt: string;
};
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
  /** Module à l'origine de l'action (absent = cœur). */
  module?: string;
  /** Feu vert juridique (calculé après création, voir lib/workspace/actions.ts). */
  legalCheck?: LegalCheck;
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
  /** Ancrage juridique de la réponse (statut + sources), conservé pour l'historique. */
  grounding?: MessageGrounding | null;
  citations?: import("@/lib/legal/citations").Citation[];
  createdAt: string;
};

export type MessageGrounding = {
  status: "fonde" | "partiel" | "non_couvert";
  label: string;
  query: string;
  sources: { id: string; document: string; page: number; articles: string[]; file: string; isExample: boolean }[];
  actions: { query: string; status: "fonde" | "partiel" | "non_couvert"; label: string }[];
};

export type ToolTrace = {
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  ok: boolean;
};

/* ----------------------------------------------------------- Comptes & abonnements */

export type User = {
  id: string;
  email: string;
  name: string;
  /** Optionnel : la connexion par code/lien magique ne requiert jamais de mot de passe. */
  passwordHash?: string;
  kind: "standard" | "invite" | "demo";
  createdAt: string;
  lastLoginAt?: string;
};

export type LoginCode = {
  id: string;
  email: string;
  codeHash: string;
  tokenHash: string;
  purpose: "connexion" | "inscription" | "reinitialisation";
  name?: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
};

/** Emails système (connexion, paiement) : visibles dans la boîte de démo en mode simulation. */
export type SystemEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: "simule" | "envoye" | "echec";
  provider: string;
  createdAt: string;
};

export type SubscriptionStatus = "active" | "en_attente" | "annulee" | "expiree";
export type Subscription = {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  provider: string;
  simulated: boolean;
  reference: string;
  amount: number;
  currency: string;
  startedAt?: string;
  currentPeriodEnd?: string;
  canceledAt?: string;
  createdAt: string;
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
  users: User[];
  loginCodes: LoginCode[];
  systemEmails: SystemEmail[];
  subscriptions: Subscription[];
  /** Données des modules (une clé par module, voir lib/modules/state.ts). */
  modules?: Record<string, ModuleState>;
};

/** État d'un module : collections libres ; `__seeded` indique si le seed démo a été appliqué. */
export type ModuleState = { __seeded?: boolean } & Record<string, unknown>;
