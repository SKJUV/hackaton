/**
 * Module « mcp-connecteurs » : connecteurs MCP + API natives, boîte unifiée, serveur MCP Co-founder.
 * Les secrets (jetons, client_secret, code_verifier) ne sont stockés que chiffrés (champ `secret`)
 * et ne sont JAMAIS renvoyés au client (voir `publicConnection`).
 */

export type McpTransport = "auto" | "streamable_http" | "sse" | "stdio";
export type AuthMode = "none" | "bearer" | "oauth";
export type NativeProvider = "gmail" | "google_calendar" | "outlook" | "whatsapp" | "slack" | "notion" | "hubspot";

export type CachedTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** true = écriture → file d'approbation obligatoire. */
  write: boolean;
  /** true = communication vers des tiers (email, WhatsApp, Slack…) → simulée tant que l'envoi réel n'est pas activé. */
  sends?: boolean;
};

export type ConnectionStatus = "non_connecte" | "connecte" | "erreur" | "autorisation_requise" | "demo";

export type Connection = {
  id: string;
  companyId: string;
  kind: "mcp" | "native";
  /** Entrée du catalogue d'origine (ex. « notion-mcp », « gmail ») ; absent pour un serveur MCP personnalisé. */
  catalogId?: string;
  provider?: NativeProvider;
  name: string;
  url?: string;
  transport: McpTransport;
  authMode: AuthMode;
  /** stdio : réservé au développement local (MCP_ALLOW_STDIO=true). */
  stdio?: { command: string; args: string[] };
  /** Paramètres NON secrets (ex. phoneNumberId WhatsApp, compte connecté). */
  config: Record<string, string>;
  enabled: boolean;
  status: ConnectionStatus;
  /** Mode démo : aucune clé/OAuth → données fictives clairement marquées. */
  demo: boolean;
  /** Secrets chiffrés AES-256-GCM (JSON) — jamais exposés. */
  secret?: string;
  account?: string;
  tools: CachedTool[];
  toolOverrides: Record<string, { enabled?: boolean; write?: boolean }>;
  lastTestedAt?: string;
  lastError?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** Contenu déchiffré de `Connection.secret`. */
export type SecretBag = {
  bearer?: string;
  tokens?: { access_token: string; refresh_token?: string; expires_at?: number; token_type?: string; scope?: string; [k: string]: unknown };
  clientInformation?: Record<string, unknown>;
  codeVerifier?: string;
  discoveryState?: Record<string, unknown>;
};

export type CallStatus = "succes" | "erreur" | "en_attente_approbation" | "rejete" | "simule" | "demo";
export type ConnectorCall = {
  id: string;
  companyId: string;
  connectionId: string;
  connectionName: string;
  tool: string;
  args: Record<string, unknown>;
  write: boolean;
  status: CallStatus;
  approvalId?: string;
  durationMs?: number;
  resultPreview?: string;
  error?: string;
  actor: string;
  createdAt: string;
};

export type OAuthPending = {
  id: string; // = paramètre `state`
  companyId: string;
  connectionId: string;
  flow: "mcp" | "native";
  /** code_verifier PKCE chiffré (flux natif). */
  secret?: string;
  redirectUri: string;
  createdAt: string;
  expiresAt: string;
};

export type InboxChannel = "email" | "whatsapp";
export type InboxCategory = "administration" | "paiement" | "client" | "candidature" | "partenariat" | "fournisseur" | "promotion" | "autre";
export type RoutineKind = "accuse_reception" | "refus_candidature" | "relance_paiement" | "confirmation_partenariat";
export type InboxMessage = {
  id: string;
  companyId: string;
  channel: InboxChannel;
  provider: "gmail" | "outlook" | "whatsapp" | "demo";
  connectionId?: string;
  externalId: string;
  threadId?: string;
  from: string;
  fromName?: string;
  subject?: string;
  body: string;
  receivedAt: string;
  category: InboxCategory;
  priority: "haute" | "normale" | "basse";
  score: number;
  reasons: string[];
  routine?: RoutineKind;
  suggestedReply: string;
  status: "nouveau" | "traite" | "archive";
  replyApprovalId?: string;
  isExample: boolean;
  createdAt: string;
};

export type McpServerToken = {
  id: string;
  companyId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  /** lecture : outils de consultation ; ecriture : création de tâches/brouillons (soumis à approbation) ; approbation : décider des approbations. */
  scopes: ("lecture" | "ecriture" | "approbation")[];
  memberId?: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type McpData = {
  connections: Connection[];
  calls: ConnectorCall[];
  oauthPending: OAuthPending[];
  inbox: InboxMessage[];
  serverTokens: McpServerToken[];
};

/** Action exécutée à la validation d'une approbation de type « action_connecteur ». */
export type ConnectorAction = { connectionId: string; connectionName: string; tool: string; args: Record<string, unknown>; sends: boolean; inboxMessageId?: string };
