import { hasEnv } from "./config";
import { NATIVE_TOOLS } from "./native/providers";
import { OAUTH, oauthConfigured } from "./native/oauth";
import type { AuthMode, McpTransport, NativeProvider } from "./types";

/**
 * Catalogue « Connecteurs ».
 * Serveurs MCP distants : URL OFFICIELLES vérifiées sur la documentation de chaque éditeur le 19/10/2026
 * (lien `docsUrl`). Aucune URL n'est inventée.
 */
export type CatalogEntry = {
  id: string;
  name: string;
  kind: "mcp" | "native";
  category: "Email & agenda" | "Messagerie" | "Documents" | "CRM & ventes" | "Paiement" | "Gestion de projet" | "Développement";
  description: string;
  provider?: NativeProvider;
  url?: string;
  sseUrl?: string;
  transport?: McpTransport;
  auth: AuthMode[];
  oauth?: {
    /** Enregistrement dynamique de client (RFC 7591) pris en charge par le serveur. */
    dcr: boolean;
    /** Client pré-enregistré requis (variables d'env) quand le serveur ne fait pas de DCR. */
    clientIdEnv?: string;
    clientSecretEnv?: string;
    scope?: string;
  };
  /** Variables d'env nécessaires au mode réel (OAuth de l'app) ; vide = rien à configurer côté serveur. */
  envVars: string[];
  bearerHint?: string;
  docsUrl: string;
  notes?: string;
};

export const MCP_CATALOG: CatalogEntry[] = [
  {
    id: "notion-mcp",
    name: "Notion (MCP officiel)",
    kind: "mcp",
    category: "Documents",
    description: "Pages, bases et recherche Notion via le serveur MCP hébergé par Notion.",
    url: "https://mcp.notion.com/mcp",
    sseUrl: "https://mcp.notion.com/sse",
    transport: "streamable_http",
    auth: ["oauth", "bearer"],
    oauth: { dcr: true },
    envVars: [],
    bearerHint: "Jeton MCP Notion (offres Business/Enterprise, créé par un propriétaire de l'espace)",
    docsUrl: "https://developers.notion.com/docs/get-started-with-mcp",
  },
  {
    id: "github-mcp",
    name: "GitHub (MCP officiel)",
    kind: "mcp",
    category: "Développement",
    description: "Dépôts, issues, pull requests et CI via le serveur MCP distant de GitHub.",
    url: "https://api.githubcopilot.com/mcp/",
    transport: "streamable_http",
    auth: ["bearer", "oauth"],
    oauth: { dcr: false, clientIdEnv: "GITHUB_MCP_CLIENT_ID", clientSecretEnv: "GITHUB_MCP_CLIENT_SECRET" },
    envVars: [],
    bearerHint: "Personal Access Token GitHub (fine-grained recommandé)",
    docsUrl: "https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md",
    notes: "OAuth : nécessite une GitHub App / OAuth App propre à Co-founder (GITHUB_MCP_CLIENT_ID/SECRET). Sinon jeton PAT.",
  },
  {
    id: "stripe-mcp",
    name: "Stripe (MCP officiel)",
    kind: "mcp",
    category: "Paiement",
    description: "Clients, factures, paiements et documentation Stripe.",
    url: "https://mcp.stripe.com",
    transport: "streamable_http",
    auth: ["oauth", "bearer"],
    oauth: { dcr: true },
    envVars: [],
    bearerHint: "Clé API « agent » Stripe (les clés secrètes classiques sont refusées à partir de décembre 2026)",
    docsUrl: "https://docs.stripe.com/mcp",
  },
  {
    id: "linear-mcp",
    name: "Linear (MCP officiel)",
    kind: "mcp",
    category: "Gestion de projet",
    description: "Issues, projets et commentaires Linear (OAuth 2.1 avec enregistrement dynamique).",
    url: "https://mcp.linear.app/mcp",
    sseUrl: "https://mcp.linear.app/sse",
    transport: "streamable_http",
    auth: ["oauth", "bearer"],
    oauth: { dcr: true },
    envVars: [],
    bearerHint: "Clé API Linear",
    docsUrl: "https://linear.app/docs/mcp",
  },
  {
    id: "hubspot-mcp",
    name: "HubSpot (MCP officiel)",
    kind: "mcp",
    category: "CRM & ventes",
    description: "CRM HubSpot (contacts, entreprises, transactions, activités) via le serveur MCP distant.",
    url: "https://mcp.hubspot.com",
    transport: "streamable_http",
    auth: ["oauth"],
    oauth: { dcr: false, clientIdEnv: "HUBSPOT_MCP_CLIENT_ID", clientSecretEnv: "HUBSPOT_MCP_CLIENT_SECRET" },
    envVars: ["HUBSPOT_MCP_CLIENT_ID", "HUBSPOT_MCP_CLIENT_SECRET"],
    docsUrl: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server",
    notes: "Créer un « MCP connector » dans HubSpot (Development → MCP Connectors) ; PKCE obligatoire (géré).",
  },
  {
    id: "slack-mcp",
    name: "Slack (MCP officiel)",
    kind: "mcp",
    category: "Messagerie",
    description: "Recherche, lecture et envoi de messages Slack via le serveur MCP de Slack.",
    url: "https://mcp.slack.com/mcp",
    transport: "streamable_http",
    auth: ["oauth"],
    oauth: {
      dcr: false,
      clientIdEnv: "SLACK_CLIENT_ID",
      clientSecretEnv: "SLACK_CLIENT_SECRET",
      scope: "search:read.public channels:history groups:history chat:write users:read channels:read",
    },
    envVars: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
    docsUrl: "https://docs.slack.dev/ai/slack-mcp-server/",
    notes: "Pas de DCR ni de SSE côté Slack ; app Slack interne ou publiée sur la Marketplace obligatoire.",
  },
  {
    id: "sentry-mcp",
    name: "Sentry (MCP officiel)",
    kind: "mcp",
    category: "Développement",
    description: "Erreurs, performances et triage Sentry.",
    url: "https://mcp.sentry.dev/mcp",
    transport: "streamable_http",
    auth: ["oauth"],
    oauth: { dcr: true },
    envVars: [],
    docsUrl: "https://docs.sentry.io/product/sentry-mcp/",
  },
  {
    id: "atlassian-mcp",
    name: "Atlassian Jira / Confluence (MCP officiel)",
    kind: "mcp",
    category: "Gestion de projet",
    description: "Jira, Confluence et autres produits Atlassian (OAuth 2.1).",
    url: "https://mcp.atlassian.com/v2/mcp",
    transport: "streamable_http",
    auth: ["oauth", "bearer"],
    oauth: { dcr: true },
    envVars: [],
    bearerHint: "Jeton API Atlassian",
    docsUrl: "https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/",
  },
  {
    id: "asana-mcp",
    name: "Asana (MCP officiel V2)",
    kind: "mcp",
    category: "Gestion de projet",
    description: "Tâches et projets Asana.",
    url: "https://mcp.asana.com/v2/mcp",
    transport: "streamable_http",
    auth: ["oauth"],
    oauth: { dcr: false, clientIdEnv: "ASANA_MCP_CLIENT_ID", clientSecretEnv: "ASANA_MCP_CLIENT_SECRET" },
    envVars: ["ASANA_MCP_CLIENT_ID", "ASANA_MCP_CLIENT_SECRET"],
    docsUrl: "https://developers.asana.com/docs/using-asanas-mcp-server",
    notes: "Asana peut exiger un client_id/secret issu de son guide d'intégration MCP.",
  },
];

const NATIVE_META: Record<NativeProvider, { name: string; category: CatalogEntry["category"]; description: string; docsUrl: string; bearer?: string; extraEnv?: string[] }> = {
  gmail: { name: "Gmail", category: "Email & agenda", description: "Lecture, brouillons et envoi d'emails (API Gmail officielle, OAuth Google).", docsUrl: "https://developers.google.com/workspace/gmail/api/guides" },
  google_calendar: { name: "Google Agenda", category: "Email & agenda", description: "Lecture et création d'événements (API Google Calendar, OAuth Google).", docsUrl: "https://developers.google.com/workspace/calendar/api/guides/overview" },
  outlook: { name: "Outlook / Microsoft 365", category: "Email & agenda", description: "Emails et calendrier via Microsoft Graph (OAuth Microsoft Entra ID).", docsUrl: "https://learn.microsoft.com/graph/api/resources/mail-api-overview" },
  whatsapp: {
    name: "WhatsApp Business",
    category: "Messagerie",
    description: "Messages WhatsApp via la Cloud API de Meta (réception par webhook, envoi après approbation).",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
    bearer: "Jeton d'accès d'utilisateur système Meta (+ identifiant du numéro)",
    extraEnv: ["WHATSAPP_VERIFY_TOKEN"],
  },
  slack: { name: "Slack", category: "Messagerie", description: "Canaux et messages via la Slack Web API (OAuth v2).", docsUrl: "https://docs.slack.dev/authentication/installing-with-oauth", bearer: "Jeton de bot Slack (xoxb-…)" },
  notion: { name: "Notion (API)", category: "Documents", description: "Recherche, lecture et création de pages via l'API Notion (OAuth public ou intégration interne).", docsUrl: "https://developers.notion.com/docs/authorization", bearer: "Jeton d'intégration interne Notion" },
  hubspot: { name: "HubSpot (API)", category: "CRM & ventes", description: "Contacts, transactions et notes via l'API CRM v3 (OAuth ou app privée).", docsUrl: "https://developers.hubspot.com/docs/api/oauth-quickstart-guide", bearer: "Jeton d'app privée HubSpot" },
};

export const NATIVE_CATALOG: CatalogEntry[] = (Object.keys(NATIVE_META) as NativeProvider[]).map((p) => ({
  id: p,
  name: NATIVE_META[p].name,
  kind: "native",
  category: NATIVE_META[p].category,
  description: NATIVE_META[p].description,
  provider: p,
  auth: NATIVE_META[p].bearer ? ["oauth", "bearer"] : ["oauth"],
  envVars: [OAUTH[p].clientIdEnv, OAUTH[p].clientSecretEnv, ...(NATIVE_META[p].extraEnv ?? [])],
  bearerHint: NATIVE_META[p].bearer,
  docsUrl: NATIVE_META[p].docsUrl,
}));

export const CATALOG: CatalogEntry[] = [...NATIVE_CATALOG, ...MCP_CATALOG];
export const catalogEntry = (id?: string) => CATALOG.find((c) => c.id === id);

/** Disponibilité réelle (uniquement des booléens et des NOMS de variables, jamais de valeur). */
export function catalogStatus(entry: CatalogEntry) {
  let oauthReady = false;
  if (entry.kind === "native" && entry.provider) oauthReady = oauthConfigured(entry.provider);
  if (entry.kind === "mcp" && entry.oauth) oauthReady = entry.oauth.dcr || hasEnv(entry.oauth.clientIdEnv ?? "_", entry.oauth.clientSecretEnv ?? "_");
  const envToken = entry.provider === "whatsapp" && hasEnv("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
  const missing = entry.kind === "native" ? (oauthReady ? [] : [OAUTH[entry.provider!].clientIdEnv, OAUTH[entry.provider!].clientSecretEnv]) : entry.envVars.filter((v) => !hasEnv(v));
  return {
    ...entry,
    oauthReady,
    envToken,
    missingEnv: missing,
    tools: entry.provider ? NATIVE_TOOLS[entry.provider].map((t) => ({ name: t.name, description: t.description, write: t.write })) : undefined,
    /** natif sans OAuth ni jeton d'env → le connecteur peut fonctionner en mode DÉMO marqué. */
    demoAvailable: entry.kind === "native",
  };
}
