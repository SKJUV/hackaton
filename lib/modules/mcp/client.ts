import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { WorkspaceError } from "@/lib/workspace/service";
import { catalogEntry, type CatalogEntry } from "./catalog";
import { env, stdioAllowed } from "./config";
import { randomToken } from "./crypto";
import type { CachedTool, Connection, SecretBag } from "./types";

/**
 * Client MCP (SDK officiel @modelcontextprotocol/sdk) :
 *  - Streamable HTTP (défaut), repli SSE (transport « auto » ou « sse »), stdio en développement local ;
 *  - authentification par jeton (Bearer) ou OAuth 2.1 (découverte RFC 9728/8414, PKCE S256,
 *    enregistrement dynamique RFC 7591 quand le serveur le propose, sinon client pré-enregistré via env).
 */
export const CLIENT_INFO = { name: "co-founder", version: "1.0.0" };

/* fetch résolu à l'appel (permet les mocks HTTP en test). */
const runtimeFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** Garde-fou SSRF : https obligatoire hors localhost ; réseaux privés refusés sauf MCP_ALLOW_PRIVATE_NETWORK=true. */
export function assertSafeMcpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WorkspaceError("URL du serveur MCP invalide.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const privateNet = local || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(host) || host.endsWith(".internal") || host.endsWith(".local") || /^f[cd][0-9a-f]{2}:/.test(host);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local && process.env.NODE_ENV !== "production")) {
    throw new WorkspaceError("Le serveur MCP doit être servi en https (http accepté uniquement pour localhost en développement).");
  }
  if (privateNet && process.env.MCP_ALLOW_PRIVATE_NETWORK !== "true" && !(local && process.env.NODE_ENV !== "production")) {
    throw new WorkspaceError("Adresse réseau privée refusée (MCP_ALLOW_PRIVATE_NETWORK=true pour l'autoriser).");
  }
  return url;
}

/** Fournisseur OAuth du SDK adossé au store chiffré (le sac de secrets est persisté par l'appelant). */
export class StoreOAuthProvider implements OAuthClientProvider {
  authorizationUrl?: URL;
  private readonly stateValue: string;
  constructor(
    public bag: SecretBag,
    private readonly opts: { redirectUri: string; state?: string; entry?: CatalogEntry },
  ) {
    this.stateValue = opts.state ?? randomToken(24);
  }
  get redirectUrl() {
    return this.opts.redirectUri;
  }
  get clientMetadata(): OAuthClientMetadata {
    const pre = this.preRegistered();
    return {
      client_name: "Co-founder",
      client_uri: env("APP_URL") || undefined,
      redirect_uris: [this.opts.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: pre?.client_secret ? "client_secret_post" : "none",
      ...(this.opts.entry?.oauth?.scope ? { scope: this.opts.entry.oauth.scope } : {}),
    };
  }
  state() {
    return this.stateValue;
  }
  private preRegistered(): OAuthClientInformationMixed | undefined {
    const o = this.opts.entry?.oauth;
    if (o?.clientIdEnv && env(o.clientIdEnv)) {
      return { client_id: env(o.clientIdEnv), ...(o.clientSecretEnv && env(o.clientSecretEnv) ? { client_secret: env(o.clientSecretEnv) } : {}) };
    }
    return undefined;
  }
  clientInformation() {
    return this.preRegistered() ?? (this.bag.clientInformation as OAuthClientInformationMixed | undefined);
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.bag.clientInformation = info as Record<string, unknown>;
  }
  tokens() {
    return this.bag.tokens as OAuthTokens | undefined;
  }
  saveTokens(tokens: OAuthTokens) {
    this.bag.tokens = { ...tokens, expires_at: tokens.expires_in ? Date.now() + Number(tokens.expires_in) * 1000 : undefined };
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(v: string) {
    this.bag.codeVerifier = v;
  }
  codeVerifier() {
    if (!this.bag.codeVerifier) throw new Error("code_verifier PKCE absent : relancez l'autorisation.");
    return this.bag.codeVerifier;
  }
  saveDiscoveryState(state: OAuthDiscoveryState) {
    this.bag.discoveryState = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  }
  discoveryState() {
    return this.bag.discoveryState as OAuthDiscoveryState | undefined;
  }
  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "tokens") delete this.bag.tokens;
    if (scope === "all" || scope === "client") delete this.bag.clientInformation;
    if (scope === "all" || scope === "verifier") delete this.bag.codeVerifier;
    if (scope === "all" || scope === "discovery") delete this.bag.discoveryState;
  }
}

async function buildTransport(conn: Connection, bag: SecretBag, kind: "streamable_http" | "sse" | "stdio", provider?: StoreOAuthProvider): Promise<Transport> {
  if (kind === "stdio") {
    if (!stdioAllowed() || !conn.stdio) throw new WorkspaceError("Transport stdio réservé au développement local (MCP_ALLOW_STDIO=true).", 403);
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    return new StdioClientTransport({ command: conn.stdio.command, args: conn.stdio.args, stderr: "pipe" });
  }
  const entry = catalogEntry(conn.catalogId);
  const raw = kind === "sse" && entry?.sseUrl && conn.url === entry.url ? entry.sseUrl : conn.url ?? "";
  const url = assertSafeMcpUrl(raw);
  const headers: Record<string, string> = {};
  if (conn.authMode === "bearer" && bag.bearer) headers.Authorization = `Bearer ${bag.bearer}`;
  const opts = { requestInit: { headers }, fetch: runtimeFetch, ...(conn.authMode === "oauth" && provider ? { authProvider: provider } : {}) };
  return kind === "sse" ? new SSEClientTransport(url, opts) : new StreamableHTTPClientTransport(url, opts);
}

export type McpSession = { client: Client; provider?: StoreOAuthProvider; transportUsed: string };

/** Ouvre une session MCP (repli SSE si Streamable HTTP échoue en mode « auto »). */
export async function openMcp(conn: Connection, bag: SecretBag, redirectUri: string): Promise<McpSession> {
  const provider = conn.authMode === "oauth" ? new StoreOAuthProvider(bag, { redirectUri, entry: catalogEntry(conn.catalogId) }) : undefined;
  const order: ("streamable_http" | "sse" | "stdio")[] = conn.transport === "auto" ? ["streamable_http", "sse"] : [conn.transport];
  let lastError: unknown;
  for (const kind of order) {
    const client = new Client(CLIENT_INFO, { capabilities: {} });
    try {
      await client.connect(await buildTransport(conn, bag, kind, provider), { timeout: 20000 });
      return { client, provider, transportUsed: kind };
    } catch (error) {
      lastError = error;
      await client.close().catch(() => undefined);
      if (error instanceof UnauthorizedError || error instanceof WorkspaceError) break;
    }
  }
  throw lastError;
}

export function isUnauthorized(error: unknown) {
  return error instanceof UnauthorizedError || (error instanceof Error && /\b401\b|unauthori[sz]ed|invalid_token/i.test(error.message));
}

type RawTool = { name: string; title?: string; description?: string; inputSchema?: Record<string, unknown>; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean; title?: string } };

/** Découverte dynamique des outils (pagination incluse). Écriture = tout outil non annoté readOnlyHint. */
export async function discoverTools(client: Client): Promise<CachedTool[]> {
  const tools: CachedTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const res = await client.listTools(cursor ? { cursor } : undefined, { timeout: 20000 });
    for (const t of res.tools as RawTool[]) {
      tools.push({
        name: t.name,
        title: t.title ?? t.annotations?.title,
        description: (t.description ?? "").slice(0, 1000),
        inputSchema: t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object", properties: {} },
        write: t.annotations?.readOnlyHint !== true,
      });
    }
    cursor = res.nextCursor;
    if (!cursor) break;
  }
  return tools;
}

export type ToolOutput = { texte: string; structure?: unknown; erreur: boolean };

export async function callMcpTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolOutput> {
  const res = (await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 })) as { content?: { type: string; text?: string; resource?: { text?: string; uri?: string } }[]; structuredContent?: unknown; isError?: boolean };
  const texte = (res.content ?? [])
    .map((c) => (c.type === "text" ? c.text : c.type === "resource" ? c.resource?.text ?? c.resource?.uri : `[${c.type}]`))
    .filter(Boolean)
    .join("\n");
  return { texte: texte.slice(0, 20000), structure: res.structuredContent, erreur: Boolean(res.isError) };
}
