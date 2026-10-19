import { attachLegalCheck } from "@/lib/workspace/legal-check";
import { log, WorkspaceError } from "@/lib/workspace/service";
import { catalogEntry, catalogStatus } from "./catalog";
import { callMcpTool, discoverTools, isUnauthorized, openMcp } from "./client";
import { connectorSendMode, env, oauthRedirectUri } from "./config";
import { keyStatus, openBag, sealBag } from "./crypto";
import { ConnectorHttpError } from "./native/http";
import { refreshTokens } from "./native/oauth";
import { fetchAccount, NATIVE_TOOLS, type NativeCtx } from "./native/providers";
import { APPROVAL_TYPE, getConnection, mcpOf, MODULE_ID, newId, nowIso, pushCall, readMcp, redact, setCallStatus, updateConnection, withData } from "./repo";
import type { AuthMode, CachedTool, CallStatus, Connection, ConnectorAction, McpTransport, SecretBag } from "./types";

/* ============================================================ Création / gestion */

export type CreateInput = {
  catalogId?: string;
  name?: string;
  url?: string;
  transport?: McpTransport;
  authMode?: AuthMode;
  bearer?: string;
  stdio?: { command: string; args: string[] };
  config?: Record<string, string>;
  demo?: boolean;
  /** WhatsApp : utiliser WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID de l'environnement. */
  useEnvToken?: boolean;
};

const clean = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function createConnection(companyId: string, input: CreateInput, actor: string): Promise<Connection> {
  const entry = catalogEntry(input.catalogId);
  if (input.catalogId && !entry) throw new WorkspaceError("Entrée de catalogue inconnue.");
  if (input.bearer && keyStatus().status === "absente") throw new WorkspaceError(keyStatus().message, 503);
  const now = nowIso();
  const base = { id: newId("cx"), companyId, enabled: true, toolOverrides: {}, createdBy: actor, createdAt: now, updatedAt: now, config: {} as Record<string, string>, tools: [] as CachedTool[] };
  let conn: Connection;
  const bag: SecretBag = {};
  if (input.bearer) bag.bearer = clean(input.bearer, 4000);

  if (entry?.kind === "native" && entry.provider) {
    const p = entry.provider;
    const status = catalogStatus(entry);
    const config: Record<string, string> = {};
    if (p === "whatsapp") {
      const pid = clean(input.config?.phoneNumberId, 40);
      if (pid) config.phoneNumberId = pid;
      if (input.useEnvToken && status.envToken) {
        config.useEnvToken = "true";
        config.phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
      }
    }
    const authMode: AuthMode = bag.bearer || config.useEnvToken ? "bearer" : "oauth";
    const demo = Boolean(input.demo) || (!bag.bearer && !config.useEnvToken && !status.oauthReady);
    if (p === "whatsapp" && bag.bearer && !config.phoneNumberId) throw new WorkspaceError("Identifiant du numéro WhatsApp (phone_number_id) requis avec un jeton.");
    conn = {
      ...base,
      kind: "native",
      catalogId: entry.id,
      provider: p,
      name: clean(input.name, 80) || entry.name,
      transport: "streamable_http",
      authMode,
      config,
      demo,
      status: demo ? "demo" : authMode === "oauth" ? "autorisation_requise" : "non_connecte",
      tools: NATIVE_TOOLS[p].map(({ run: _r, demo: _d, ...t }) => t),
    };
  } else {
    const url = entry?.url ?? clean(input.url, 500);
    const transport: McpTransport = input.transport && ["auto", "streamable_http", "sse", "stdio"].includes(input.transport) ? input.transport : entry?.transport ?? "auto";
    if (transport !== "stdio" && !url) throw new WorkspaceError("URL du serveur MCP requise.");
    if (transport === "stdio" && !input.stdio?.command) throw new WorkspaceError("Commande stdio requise.");
    const authMode: AuthMode = bag.bearer ? "bearer" : input.authMode === "oauth" || (entry && entry.auth.includes("oauth") && input.authMode !== "none") ? "oauth" : input.authMode === "bearer" ? "bearer" : "none";
    if (authMode === "bearer" && !bag.bearer) throw new WorkspaceError("Jeton requis pour l'authentification Bearer.");
    conn = {
      ...base,
      kind: "mcp",
      catalogId: entry?.id,
      name: clean(input.name, 80) || entry?.name || new URL(url || "http://serveur-local").hostname,
      url: url || undefined,
      transport,
      stdio: transport === "stdio" ? { command: clean(input.stdio?.command, 200), args: (input.stdio?.args ?? []).map((a) => clean(a, 300)).slice(0, 30) } : undefined,
      authMode,
      demo: false,
      status: authMode === "oauth" ? "autorisation_requise" : "non_connecte",
    };
  }
  conn.secret = sealBag(bag);
  return withData((data) => {
    mcpOf(data).connections.push(conn);
    log(data, companyId, actor, "connecteur.ajout", `Connecteur « ${conn.name} » ajouté (${conn.kind === "mcp" ? `MCP ${conn.transport}` : "API native"}${conn.demo ? ", mode DÉMO" : ""}).`);
    return structuredClone(conn);
  });
}

export async function patchConnection(id: string, patch: { enabled?: boolean; name?: string; bearer?: string; toolOverrides?: Record<string, { enabled?: boolean; write?: boolean }>; phoneNumberId?: string }, actor: string) {
  return updateConnection(id, (c, data) => {
    if (typeof patch.enabled === "boolean") c.enabled = patch.enabled;
    if (patch.name) c.name = clean(patch.name, 80);
    if (patch.phoneNumberId && c.provider === "whatsapp") c.config.phoneNumberId = clean(patch.phoneNumberId, 40);
    if (patch.bearer) {
      const bag = openBag(c.secret);
      bag.bearer = clean(patch.bearer, 4000);
      c.secret = sealBag(bag);
      c.authMode = "bearer";
      c.demo = false;
      c.status = "non_connecte";
    }
    if (patch.toolOverrides) {
      for (const [name, o] of Object.entries(patch.toolOverrides)) {
        if (!c.tools.some((t) => t.name === name)) continue;
        const cur = c.toolOverrides[name] ?? {};
        if (typeof o.enabled === "boolean") cur.enabled = o.enabled;
        // On peut forcer « écriture » ; repasser un outil en lecture seule n'est possible que s'il n'envoie rien à des tiers.
        if (typeof o.write === "boolean") cur.write = o.write || c.tools.find((t) => t.name === name)?.sends ? true : false;
        c.toolOverrides[name] = cur;
      }
    }
    log(data, c.companyId, actor, "connecteur.modification", `Connecteur « ${c.name} » mis à jour.`);
  });
}

export async function deleteConnection(id: string, actor: string) {
  return withData((data) => {
    const m = mcpOf(data);
    const conn = m.connections.find((c) => c.id === id);
    if (!conn) throw new WorkspaceError("Connecteur introuvable.", 404);
    m.connections = m.connections.filter((c) => c.id !== id);
    m.oauthPending = m.oauthPending.filter((o) => o.connectionId !== id);
    log(data, conn.companyId, actor, "connecteur.suppression", `Connecteur « ${conn.name} » supprimé (secrets effacés).`);
    return { ok: true };
  });
}

/* ============================================================ Jetons natifs */

async function nativeContext(conn: Connection): Promise<NativeCtx> {
  const bag = openBag(conn.secret);
  const config: Record<string, string> = { ...conn.config, __sendMode: connectorSendMode() };
  if (conn.provider === "whatsapp" && !config.phoneNumberId) throw new WorkspaceError("Numéro WhatsApp (phone_number_id) non configuré.");
  if (bag.bearer) return { token: bag.bearer, config };
  if (conn.config.useEnvToken === "true" && env("WHATSAPP_ACCESS_TOKEN")) return { token: env("WHATSAPP_ACCESS_TOKEN"), config };
  if (!bag.tokens?.access_token) throw new WorkspaceError("Autorisation requise : connectez le compte (OAuth).", 401);
  if (bag.tokens.expires_at && bag.tokens.expires_at < Date.now() + 60_000 && bag.tokens.refresh_token) {
    return { token: await refreshNative(conn, bag), config };
  }
  return { token: bag.tokens.access_token, config };
}

async function refreshNative(conn: Connection, bag: SecretBag): Promise<string> {
  if (!bag.tokens?.refresh_token || !conn.provider) throw new WorkspaceError("Autorisation expirée : reconnectez le compte.", 401);
  const t = await refreshTokens(conn.provider, bag.tokens.refresh_token);
  bag.tokens = { ...bag.tokens, ...t };
  await updateConnection(conn.id, (c) => {
    c.secret = sealBag(bag);
  });
  return t.access_token;
}

/* ============================================================ Test de connexion */

export async function testConnection(id: string, actor = "utilisateur") {
  const conn = await getConnection(id);
  const started = Date.now();
  try {
    if (conn.kind === "native") {
      if (conn.demo) {
        return finishTest(conn, { status: "demo", tools: conn.tools, account: "démo", actor, ms: Date.now() - started });
      }
      const ctx = await nativeContext(conn);
      const account = await fetchAccount(conn.provider!, ctx);
      if (!account && conn.provider !== "whatsapp") throw new Error("Le fournisseur n'a pas confirmé le compte (jeton invalide ou droits insuffisants).");
      const tools = NATIVE_TOOLS[conn.provider!].map(({ run: _r, demo: _d, ...t }) => t);
      return finishTest(conn, { status: "connecte", tools, account, actor, ms: Date.now() - started });
    }
    const bag = openBag(conn.secret);
    const before = JSON.stringify(bag);
    const session = await openMcp(conn, bag, oauthRedirectUri());
    try {
      const tools = await discoverTools(session.client);
      const version = session.client.getServerVersion();
      return finishTest(conn, { status: "connecte", tools, account: version ? `${version.name} ${version.version}` : undefined, actor, ms: Date.now() - started, bag: JSON.stringify(bag) !== before ? bag : undefined, transport: session.transportUsed });
    } finally {
      await session.client.close().catch(() => undefined);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unauthorized = isUnauthorized(error) || (error instanceof WorkspaceError && error.status === 401);
    await updateConnection(id, (c, data) => {
      c.status = unauthorized ? "autorisation_requise" : "erreur";
      c.lastError = message.slice(0, 400);
      c.lastTestedAt = nowIso();
      log(data, c.companyId, actor, "connecteur.test", `Test de « ${c.name} » : échec (${unauthorized ? "autorisation requise" : message.slice(0, 120)}).`);
    });
    return { ok: false as const, status: unauthorized ? "autorisation_requise" : "erreur", error: message.slice(0, 400) };
  }
}

async function finishTest(conn: Connection, r: { status: Connection["status"]; tools: CachedTool[]; account?: string; actor: string; ms: number; bag?: SecretBag; transport?: string }) {
  const updated = await updateConnection(conn.id, (c, data) => {
    c.status = r.status;
    c.tools = r.tools;
    if (r.account) c.account = r.account;
    if (r.bag) c.secret = sealBag(r.bag);
    c.lastError = undefined;
    c.lastTestedAt = nowIso();
    log(data, c.companyId, r.actor, "connecteur.test", `Test de « ${c.name} » : ${r.status === "demo" ? "mode DÉMO" : "connecté"} — ${r.tools.length} outil(s)${r.transport ? ` via ${r.transport}` : ""} (${r.ms} ms).`);
  });
  return { ok: true as const, status: updated.status, tools: updated.tools.length, account: updated.account, transport: r.transport };
}

/* ============================================================ Exécution */

export function effectiveTool(conn: Connection, name: string) {
  const tool = conn.tools.find((t) => t.name === name);
  if (!tool) return null;
  const o = conn.toolOverrides[name] ?? {};
  return { ...tool, enabled: o.enabled !== false, write: tool.sends ? true : o.write ?? tool.write };
}

type ExecResult = { status: CallStatus; result: unknown; preview: string; error?: string };
const previewOf = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v) ?? "").slice(0, 600);

/** Exécution effective (après contrôle d'approbation par l'appelant). */
export async function executeTool(conn: Connection, toolName: string, args: Record<string, unknown>): Promise<ExecResult> {
  const tool = effectiveTool(conn, toolName);
  if (!tool) throw new WorkspaceError(`Outil inconnu sur ce connecteur : ${toolName}`, 404);
  if (conn.kind === "native") {
    const def = NATIVE_TOOLS[conn.provider!].find((t) => t.name === toolName)!;
    if (conn.demo) {
      const result = def.demo(args);
      return { status: "demo", result, preview: previewOf(result) };
    }
    if (tool.sends && connectorSendMode() === "simulation") {
      const result = { simulation: true, message: "SIMULATION — rien n'a été envoyé (CONNECTORS_SEND_MODE=live pour l'envoi réel).", requete: redact(args) };
      return { status: "simule", result, preview: result.message };
    }
    let ctx = await nativeContext(conn);
    try {
      const result = await def.run(args, ctx);
      return { status: "succes", result, preview: previewOf(result) };
    } catch (error) {
      if (error instanceof ConnectorHttpError && error.status === 401 && openBag(conn.secret).tokens?.refresh_token) {
        ctx = { ...ctx, token: await refreshNative(conn, openBag(conn.secret)) };
        const result = await def.run(args, ctx);
        return { status: "succes", result, preview: previewOf(result) };
      }
      throw error;
    }
  }
  const bag = openBag(conn.secret);
  const before = JSON.stringify(bag);
  const session = await openMcp(conn, bag, oauthRedirectUri());
  try {
    const out = await callMcpTool(session.client, toolName, args);
    return { status: out.erreur ? "erreur" : "succes", result: out, preview: out.texte.slice(0, 600) || previewOf(out.structure), error: out.erreur ? out.texte.slice(0, 300) : undefined };
  } finally {
    await session.client.close().catch(() => undefined);
    if (JSON.stringify(bag) !== before) await updateConnection(conn.id, (c) => void (c.secret = sealBag(bag)));
  }
}

export type InvokeResult =
  | { pending: true; approvalId: string; summary: string }
  | { pending: false; status: CallStatus; result: unknown; summary: string };

/**
 * Point d'entrée unique (agent, UI, serveur MCP, boîte unifiée) :
 * lecture → exécution immédiate journalisée ; écriture → file d'approbation (exécution à la validation).
 */
export async function invokeConnectorTool(
  companyId: string,
  connectionId: string,
  toolName: string,
  args: Record<string, unknown>,
  actor: string,
  opts: { inboxMessageId?: string; title?: string } = {},
): Promise<InvokeResult> {
  const conn = await getConnection(connectionId);
  if (conn.companyId !== companyId) throw new WorkspaceError("Connecteur introuvable dans cette entreprise.", 404);
  if (!conn.enabled) throw new WorkspaceError(`Le connecteur « ${conn.name} » est désactivé pour cette entreprise.`, 409);
  const tool = effectiveTool(conn, toolName);
  if (!tool) throw new WorkspaceError(`Outil « ${toolName} » introuvable : testez le connecteur pour rafraîchir la liste.`, 404);
  if (!tool.enabled) throw new WorkspaceError(`L'outil « ${toolName} » est désactivé.`, 409);

  if (tool.write) {
    const res = await withData((data) => {
      const approvalId = newId("apr");
      const action: ConnectorAction = { id: approvalId, companyId, connectionId, connectionName: conn.name, tool: toolName, args, sends: Boolean(tool.sends), inboxMessageId: opts.inboxMessageId };
      const mode = tool.sends ? (connectorSendMode() === "live" ? "Envoi RÉEL à un tiers" : "Envoi à un tiers (simulation, rien ne part)") : "Écriture";
      const approval = {
        id: approvalId,
        companyId,
        type: APPROVAL_TYPE,
        module: MODULE_ID,
        title: opts.title ?? `${conn.name} : ${tool.title ?? toolName}`,
        summary: `${mode} via ${conn.kind === "mcp" ? "MCP" : "API officielle"}${conn.demo ? " — DÉMO (données fictives)" : ""}\nConnecteur : ${conn.name}\nOutil : ${toolName}\n${JSON.stringify(redact(args), null, 2).slice(0, 2500)}`,
        emailId: "",
        status: "en_attente" as const,
        requestedBy: actor,
        createdAt: nowIso(),
      };
      data.approvals.push(approval);
      mcpOf(data).actions.push(action);
      pushCall(data, { companyId, connectionId, connectionName: conn.name, tool: toolName, args, write: true, status: "en_attente_approbation", approvalId: approval.id, actor });
      log(data, companyId, actor, "approbation.demande", `${approval.title} — en attente de validation humaine.`);
      return { pending: true as const, approvalId: approval.id, summary: `« ${toolName} » (${conn.name}) en attente d'approbation` };
    });
    // Feu vert juridique (informatif, ne bloque jamais) affiché dans la carte d'approbation.
    await attachLegalCheck([res.approvalId], legalQueryOf(toolName, args));
    return res;
  }

  const started = Date.now();
  try {
    const r = await executeTool(conn, toolName, args);
    await withData((data) => {
      pushCall(data, { companyId, connectionId, connectionName: conn.name, tool: toolName, args, write: false, status: r.status, durationMs: Date.now() - started, resultPreview: r.preview, error: r.error, actor });
    });
    return { pending: false, status: r.status, result: r.result, summary: `${conn.name} · ${toolName} : ${r.status === "demo" ? "résultat DÉMO" : r.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await withData((data) => {
      pushCall(data, { companyId, connectionId, connectionName: conn.name, tool: toolName, args, write: false, status: "erreur", durationMs: Date.now() - started, error: message.slice(0, 400), actor });
      if (isUnauthorized(error)) {
        const c = mcpOf(data).connections.find((x) => x.id === connectionId);
        if (c) c.status = "autorisation_requise";
      }
    });
    throw error instanceof WorkspaceError ? error : new WorkspaceError(`${conn.name} : ${message.slice(0, 300)}`, 502);
  }
}

/** Requête du feu vert juridique : textes des arguments (objet, corps, message…). */
function legalQueryOf(tool: string, args: Record<string, unknown>) {
  const texts: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 3 || texts.join(" ").length > 400) return;
    if (typeof v === "string" && !/^[\w.+-]+@[\w.-]+$/.test(v) && !/^\+?\d[\d\s]+$/.test(v)) texts.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(args, 0);
  return `${tool.replace(/_/g, " ")} ${texts.join(" ")}`.slice(0, 400);
}

/** Décision sur une approbation « connecteurs_action » (appelée par decideApproval). */
export async function decideConnectorApproval(approvalId: string, decision: "approuver" | "rejeter", decidedBy: string, note?: string) {
  const pending = await withData((data) => {
    const approval = data.approvals.find((a) => a.id === approvalId);
    const action = mcpOf(data).actions.find((x) => x.id === approvalId);
    if (!approval || !action) throw new WorkspaceError("Approbation introuvable.", 404);
    if (approval.status !== "en_attente") throw new WorkspaceError("Cette demande a déjà été traitée.", 409);
    approval.status = decision === "approuver" ? "approuvee" : "rejetee";
    approval.decidedBy = decidedBy;
    approval.decidedAt = nowIso();
    approval.decisionNote = note;
    if (decision === "rejeter") {
      setCallStatus(data, approvalId, "rejete");
      log(data, approval.companyId, decidedBy, "approbation.rejet", `${approval.title} rejeté${note ? ` : ${note}` : ""}.`);
      return null;
    }
    log(data, approval.companyId, decidedBy, "approbation.validation", `${approval.title} validé.`);
    return { companyId: approval.companyId, action: { ...action } };
  });
  if (!pending) return { status: "rejetee" as const };

  const started = Date.now();
  let outcome: ExecResult;
  try {
    const { mcp } = await readMcp();
    const conn = mcp.connections.find((c) => c.id === pending.action.connectionId);
    if (!conn || conn.companyId !== pending.companyId) throw new Error("Connecteur supprimé entre-temps.");
    if (!conn.enabled) throw new Error("Connecteur désactivé.");
    outcome = await executeTool(conn, pending.action.tool, pending.action.args);
  } catch (error) {
    outcome = { status: "erreur", result: null, preview: "", error: (error instanceof Error ? error.message : String(error)).slice(0, 400) };
  }
  return withData((data) => {
    setCallStatus(data, approvalId, outcome.status, { durationMs: Date.now() - started, resultPreview: outcome.preview, error: outcome.error });
    const msg = pending.action.inboxMessageId ? mcpOf(data).inbox.find((m) => m.id === pending.action.inboxMessageId) : undefined;
    if (msg && outcome.status !== "erreur") msg.status = "traite";
    const label = outcome.status === "simule" ? "[SIMULATION] " : outcome.status === "demo" ? "[DÉMO] " : "";
    log(data, pending.companyId, "agent", `connecteur.${outcome.status}`, `${label}${pending.action.connectionName} · ${pending.action.tool}${outcome.error ? ` : ${outcome.error}` : ""}.`);
    return { status: "approuvee" as const, callStatus: outcome.status, error: outcome.error, resultat: outcome.preview };
  });
}

/* ============================================================ Lecture (UI) */

export async function listCalls(companyId: string, limit = 200) {
  const { mcp } = await readMcp();
  return mcp.calls.filter((c) => c.companyId === companyId).slice(0, limit);
}
