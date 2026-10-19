import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { log, WorkspaceError } from "@/lib/workspace/service";
import { catalogEntry } from "./catalog";
import { assertSafeMcpUrl, StoreOAuthProvider } from "./client";
import { oauthRedirectUri } from "./config";
import { encryptString, decryptString, keyStatus, openBag, randomToken, sealBag } from "./crypto";
import { testConnection } from "./connectors";
import { buildAuthorizeUrl, exchangeCode, oauthConfigured, OAUTH, pkcePair } from "./native/oauth";
import { discoverWhatsAppNumber } from "./native/providers";
import { getConnection, mcpOf, nowIso, updateConnection, withData } from "./repo";

const STATE_TTL_MS = 15 * 60_000;
const runtimeFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/**
 * Démarre l'autorisation :
 *  - serveur MCP : flux d'autorisation MCP standard (SDK) — découverte, DCR si disponible, PKCE S256 ;
 *  - connecteur natif : OAuth 2.0 du fournisseur (PKCE quand il le permet).
 * Renvoie l'URL vers laquelle rediriger le navigateur.
 */
export async function startOAuth(connectionId: string, baseUrl: string | undefined, actor: string): Promise<{ authorizationUrl: string } | { alreadyAuthorized: true }> {
  if (keyStatus().status === "absente") throw new WorkspaceError(keyStatus().message, 503);
  const conn = await getConnection(connectionId);
  const redirectUri = oauthRedirectUri(baseUrl);
  const state = randomToken(24);
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();

  if (conn.kind === "native") {
    const p = conn.provider!;
    if (!oauthConfigured(p)) throw new WorkspaceError(`OAuth ${OAUTH[p].label} non configuré : définissez ${OAUTH[p].clientIdEnv} et ${OAUTH[p].clientSecretEnv}.`, 503);
    const { verifier, challenge } = pkcePair();
    const url = buildAuthorizeUrl(p, { state, redirectUri, codeChallenge: OAUTH[p].pkce ? challenge : undefined });
    await withData((data) => {
      const m = mcpOf(data);
      m.oauthPending = m.oauthPending.filter((o) => new Date(o.expiresAt).getTime() > Date.now());
      m.oauthPending.push({ id: state, companyId: conn.companyId, connectionId, flow: "native", secret: encryptString(verifier), redirectUri, createdAt: nowIso(), expiresAt });
      log(data, conn.companyId, actor, "connecteur.oauth", `Autorisation ${OAUTH[p].label} demandée pour « ${conn.name} ».`);
    });
    return { authorizationUrl: url };
  }

  if (conn.authMode !== "oauth" || !conn.url) throw new WorkspaceError("Ce connecteur n'utilise pas OAuth.");
  assertSafeMcpUrl(conn.url);
  const bag = openBag(conn.secret);
  delete bag.tokens;
  const provider = new StoreOAuthProvider(bag, { redirectUri, state, entry: catalogEntry(conn.catalogId) });
  const result = await auth(provider, { serverUrl: conn.url, fetchFn: runtimeFetch });
  await withData((data) => {
    const m = mcpOf(data);
    const c = m.connections.find((x) => x.id === connectionId)!;
    c.secret = sealBag(bag);
    if (result === "REDIRECT") {
      m.oauthPending = m.oauthPending.filter((o) => new Date(o.expiresAt).getTime() > Date.now());
      m.oauthPending.push({ id: state, companyId: conn.companyId, connectionId, flow: "mcp", redirectUri, createdAt: nowIso(), expiresAt });
    }
    log(data, conn.companyId, actor, "connecteur.oauth", `Autorisation OAuth MCP demandée pour « ${conn.name} »${bag.clientInformation && !catalogEntry(conn.catalogId)?.oauth?.clientIdEnv ? " (client enregistré dynamiquement)" : ""}.`);
  });
  if (result === "AUTHORIZED") return { alreadyAuthorized: true };
  if (!provider.authorizationUrl) throw new WorkspaceError("Le serveur MCP n'a pas fourni d'URL d'autorisation.", 502);
  return { authorizationUrl: provider.authorizationUrl.toString() };
}

/** Callback OAuth (URI unique `/api/mcp/oauth/callback`). Renvoie l'entreprise et le connecteur concernés. */
export async function finishOAuth(state: string, code: string | null, providerError: string | null, viewerCanAccess: (companyId: string) => boolean) {
  const pending = await withData((data) => {
    const m = mcpOf(data);
    const p = m.oauthPending.find((o) => o.id === state);
    m.oauthPending = m.oauthPending.filter((o) => o.id !== state && new Date(o.expiresAt).getTime() > Date.now());
    return p ? structuredClone(p) : null;
  });
  if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) throw new WorkspaceError("Autorisation expirée ou inconnue : recommencez.", 400);
  if (!viewerCanAccess(pending.companyId)) throw new WorkspaceError("Entreprise introuvable.", 404);
  if (providerError) {
    await updateConnection(pending.connectionId, (c) => {
      c.status = "autorisation_requise";
      c.lastError = `Autorisation refusée : ${providerError.slice(0, 120)}`;
    });
    throw new WorkspaceError(`Autorisation refusée par le fournisseur (${providerError.slice(0, 80)}).`, 400);
  }
  if (!code) throw new WorkspaceError("Code d'autorisation absent.", 400);
  const conn = await getConnection(pending.connectionId);

  if (pending.flow === "native") {
    const p = conn.provider!;
    const tokens = await exchangeCode(p, code, pending.redirectUri, pending.secret ? decryptString(pending.secret) : undefined);
    const extraConfig: Record<string, string> = { ...(tokens.extra ?? {}) };
    if (p === "whatsapp" && !conn.config.phoneNumberId) {
      const wa = await discoverWhatsAppNumber(tokens.access_token).catch(() => ({}) as { phoneNumberId?: string; wabaId?: string });
      if (wa.phoneNumberId) extraConfig.phoneNumberId = wa.phoneNumberId;
      if (wa.wabaId) extraConfig.wabaId = wa.wabaId;
    }
    await updateConnection(conn.id, (c) => {
      const bag = openBag(c.secret);
      const { account: _a, extra: _e, ...t } = tokens;
      bag.tokens = t;
      delete bag.bearer;
      c.secret = sealBag(bag);
      c.authMode = "oauth";
      c.demo = false;
      c.status = "non_connecte";
      c.config = { ...c.config, ...extraConfig };
      if (tokens.account) c.account = tokens.account;
    });
  } else {
    const bag = openBag(conn.secret);
    const provider = new StoreOAuthProvider(bag, { redirectUri: pending.redirectUri, state, entry: catalogEntry(conn.catalogId) });
    const result = await auth(provider, { serverUrl: conn.url!, authorizationCode: code, fetchFn: runtimeFetch });
    if (result !== "AUTHORIZED") throw new WorkspaceError("Échange du code OAuth refusé par le serveur MCP.", 502);
    delete bag.codeVerifier;
    await updateConnection(conn.id, (c) => {
      c.secret = sealBag(bag);
      c.status = "non_connecte";
    });
  }
  const test = await testConnection(conn.id, "oauth");
  return { companyId: pending.companyId, connectionId: conn.id, ok: test.ok };
}
