import { createHash, randomBytes } from "node:crypto";
import { env, hasEnv } from "../config";
import type { NativeProvider } from "../types";
import { apiFetch } from "./http";

/** Définition OAuth 2.0 (code d'autorisation) d'un fournisseur natif. */
export type OAuthDef = {
  label: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: () => string;
  tokenUrl: () => string;
  scopes: string[];
  scopeParam?: "scope" | "user_scope";
  scopeSeparator?: string;
  pkce: boolean;
  extraAuthParams?: Record<string, string>;
  /** basic = client_secret en Authorization Basic ; body = dans le formulaire ; get = échange par GET (Meta). */
  tokenAuth: "body" | "basic" | "get";
  tokenFormat?: "form" | "json";
};

const graphVersion = () => env("WHATSAPP_GRAPH_VERSION") || "v23.0";
const msTenant = () => env("MICROSOFT_TENANT_ID") || "common";

const GOOGLE = (scopes: string[]): OAuthDef => ({
  label: "Google",
  clientIdEnv: "GOOGLE_CLIENT_ID",
  clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  authorizeUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: () => "https://oauth2.googleapis.com/token",
  scopes: ["openid", "email", ...scopes],
  pkce: true,
  extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  tokenAuth: "body",
});

export const OAUTH: Record<NativeProvider, OAuthDef> = {
  gmail: GOOGLE(["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.send"]),
  google_calendar: GOOGLE(["https://www.googleapis.com/auth/calendar.events"]),
  outlook: {
    label: "Microsoft",
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    authorizeUrl: () => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/authorize`,
    tokenUrl: () => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/token`,
    scopes: ["offline_access", "openid", "email", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"],
    pkce: true,
    extraAuthParams: { response_mode: "query" },
    tokenAuth: "body",
  },
  whatsapp: {
    label: "Meta",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    authorizeUrl: () => `https://www.facebook.com/${graphVersion()}/dialog/oauth`,
    tokenUrl: () => `https://graph.facebook.com/${graphVersion()}/oauth/access_token`,
    scopes: ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"],
    scopeSeparator: ",",
    pkce: false,
    tokenAuth: "get",
  },
  slack: {
    label: "Slack",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    authorizeUrl: () => "https://slack.com/oauth/v2/authorize",
    tokenUrl: () => "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "channels:history", "groups:read", "chat:write", "users:read"],
    scopeSeparator: ",",
    pkce: false,
    tokenAuth: "body",
  },
  notion: {
    label: "Notion",
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
    authorizeUrl: () => "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: () => "https://api.notion.com/v1/oauth/token",
    scopes: [],
    pkce: false,
    extraAuthParams: { owner: "user" },
    tokenAuth: "basic",
    tokenFormat: "json",
  },
  hubspot: {
    label: "HubSpot",
    clientIdEnv: "HUBSPOT_CLIENT_ID",
    clientSecretEnv: "HUBSPOT_CLIENT_SECRET",
    authorizeUrl: () => "https://app.hubspot.com/oauth/authorize",
    tokenUrl: () => "https://api.hubapi.com/oauth/v1/token",
    scopes: ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.deals.read"],
    pkce: false,
    tokenAuth: "body",
  },
};

export const oauthConfigured = (p: NativeProvider) => hasEnv(OAUTH[p].clientIdEnv, OAUTH[p].clientSecretEnv);

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(p: NativeProvider, opts: { state: string; redirectUri: string; codeChallenge?: string }): string {
  const def = OAUTH[p];
  const url = new URL(def.authorizeUrl());
  url.searchParams.set("client_id", env(def.clientIdEnv));
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", opts.state);
  if (def.scopes.length) url.searchParams.set(def.scopeParam ?? "scope", def.scopes.join(def.scopeSeparator ?? " "));
  if (p === "whatsapp" && env("META_CONFIG_ID")) url.searchParams.set("config_id", env("META_CONFIG_ID"));
  for (const [k, v] of Object.entries(def.extraAuthParams ?? {})) url.searchParams.set(k, v);
  if (def.pkce && opts.codeChallenge) {
    url.searchParams.set("code_challenge", opts.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export type TokenSet = { access_token: string; refresh_token?: string; expires_at?: number; token_type?: string; scope?: string; account?: string; extra?: Record<string, string> };

function normalize(p: NativeProvider, raw: Record<string, unknown>): TokenSet {
  if (p === "slack") {
    if (raw.ok === false) throw new Error(`Slack OAuth : ${String(raw.error)}`);
    const team = raw.team as { name?: string; id?: string } | undefined;
    return {
      access_token: String(raw.access_token ?? ""),
      refresh_token: raw.refresh_token ? String(raw.refresh_token) : undefined,
      expires_at: typeof raw.expires_in === "number" ? Date.now() + raw.expires_in * 1000 : undefined,
      scope: raw.scope ? String(raw.scope) : undefined,
      account: team?.name,
      extra: team?.id ? { teamId: team.id } : undefined,
    };
  }
  if (!raw.access_token) throw new Error(`${OAUTH[p].label} OAuth : jeton absent de la réponse.`);
  return {
    access_token: String(raw.access_token),
    refresh_token: raw.refresh_token ? String(raw.refresh_token) : undefined,
    expires_at: typeof raw.expires_in === "number" ? Date.now() + raw.expires_in * 1000 : undefined,
    token_type: raw.token_type ? String(raw.token_type) : undefined,
    scope: raw.scope ? String(raw.scope) : undefined,
    account: p === "notion" ? String((raw.workspace_name as string) ?? "") || undefined : undefined,
    extra: p === "notion" && raw.workspace_id ? { workspaceId: String(raw.workspace_id) } : undefined,
  };
}

async function tokenRequest(p: NativeProvider, params: Record<string, string>): Promise<TokenSet> {
  const def = OAUTH[p];
  const id = env(def.clientIdEnv);
  const secret = env(def.clientSecretEnv);
  if (!id || !secret) throw new Error(`${def.clientIdEnv} / ${def.clientSecretEnv} manquants.`);
  if (def.tokenAuth === "get") {
    const url = new URL(def.tokenUrl());
    for (const [k, v] of Object.entries({ ...params, client_id: id, client_secret: secret })) url.searchParams.set(k, v);
    return normalize(p, await apiFetch<Record<string, unknown>>(def.label, url.toString()));
  }
  if (def.tokenAuth === "basic") {
    const headers = { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` };
    const raw = def.tokenFormat === "json" ? await apiFetch<Record<string, unknown>>(def.label, def.tokenUrl(), { json: params, headers }) : await apiFetch<Record<string, unknown>>(def.label, def.tokenUrl(), { form: params, headers });
    return normalize(p, raw);
  }
  return normalize(p, await apiFetch<Record<string, unknown>>(def.label, def.tokenUrl(), { form: { ...params, client_id: id, client_secret: secret } }));
}

export function exchangeCode(p: NativeProvider, code: string, redirectUri: string, codeVerifier?: string) {
  const params: Record<string, string> = { grant_type: "authorization_code", code, redirect_uri: redirectUri };
  if (OAUTH[p].pkce && codeVerifier) params.code_verifier = codeVerifier;
  if (OAUTH[p].tokenAuth === "get") delete params.grant_type;
  return tokenRequest(p, params);
}

export async function refreshTokens(p: NativeProvider, refreshToken: string): Promise<TokenSet> {
  const t = await tokenRequest(p, { grant_type: "refresh_token", refresh_token: refreshToken });
  return { ...t, refresh_token: t.refresh_token ?? refreshToken };
}
