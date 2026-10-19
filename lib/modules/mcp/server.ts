import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TOOL_MAP, type ToolContext } from "@/lib/agent/registry";
import { decideApproval, log, WorkspaceError } from "@/lib/workspace/service";
import { randomToken, sha256 } from "./crypto";
import { mcpOf, newId, nowIso, readMcp, withData } from "./repo";
import type { McpServerToken } from "./types";

/**
 * Serveur MCP de Co-founder (Streamable HTTP, sans état) : publie les outils juridiques et workspace
 * pour Claude, Cursor, etc. Authentification : jeton Bearer PAR ENTREPRISE (haché SHA-256 au repos).
 */
export const SERVER_INFO = { name: "co-founder", version: "1.0.0" };
type Scope = McpServerToken["scopes"][number];

/** Outils publiés → portée requise. Les actions externes restent soumises à la file d'approbation. */
const PUBLISHED: Record<string, Scope> = {
  rechercher_textes_juridiques: "lecture",
  briefing_cofondateur: "lecture",
  lister_taches: "lecture",
  checklist_creation_entreprise: "lecture",
  score_conformite: "lecture",
  veille_reglementaire: "lecture",
  lister_fournisseurs: "lecture",
  suivre_devis: "lecture",
  connecteurs_boite_unifiee: "lecture",
  connecteurs_lister: "lecture",
  creer_tache: "ecriture",
  mettre_a_jour_demarche: "ecriture",
  calendrier_obligations: "ecriture",
  generer_document_juridique: "ecriture",
  generer_business_plan: "ecriture",
  generer_roadmap: "ecriture",
  rediger_email: "ecriture",
  demander_devis: "ecriture",
  relancer_fournisseur: "ecriture",
  connecteurs_preparer_reponse: "ecriture",
};

const EXTRA_TOOLS = [
  { name: "lister_approbations", scope: "lecture" as Scope, description: "Liste les actions en attente de validation humaine (emails, devis, actions de connecteurs).", inputSchema: { type: "object", properties: {} } },
  {
    name: "decider_approbation",
    scope: "approbation" as Scope,
    description: "Valide ou rejette une approbation AU NOM du membre lié au jeton (portée « approbation » requise).",
    inputSchema: { type: "object", properties: { approbation_id: { type: "string" }, decision: { type: "string", enum: ["approuver", "rejeter"] }, note: { type: "string" } }, required: ["approbation_id", "decision"] },
  },
];

/* ------------------------------------------------------------------ Jetons */

export async function createServerToken(companyId: string, input: { name: string; scopes?: Scope[]; memberId?: string }, actor: string) {
  const raw = `cf_mcp_${randomToken(32)}`;
  const scopes = (input.scopes?.length ? input.scopes : ["lecture", "ecriture"]).filter((x): x is Scope => ["lecture", "ecriture", "approbation"].includes(x));
  return withData((data) => {
    if (scopes.includes("approbation")) {
      const member = data.members.find((m) => m.id === input.memberId && m.companyId === companyId);
      if (!member || member.role === "lecteur") throw new WorkspaceError("La portée « approbation » exige un membre (non lecteur) de l'entreprise.", 400);
    }
    const token: McpServerToken = { id: newId("mct"), companyId, name: (input.name || "Client MCP").slice(0, 60), tokenHash: sha256(raw), prefix: raw.slice(0, 14), scopes, memberId: input.memberId, createdBy: actor, createdAt: nowIso() };
    mcpOf(data).serverTokens.push(token);
    log(data, companyId, actor, "mcp.jeton", `Jeton MCP « ${token.name} » créé (${scopes.join(", ")}).`);
    const { tokenHash: _h, ...pub } = token;
    return { ...pub, token: raw };
  });
}

export async function listServerTokens(companyId: string) {
  const { mcp } = await readMcp();
  return mcp.serverTokens.filter((t) => t.companyId === companyId).map(({ tokenHash: _h, ...t }) => t);
}

export async function revokeServerToken(id: string, actor: string) {
  return withData((data) => {
    const t = mcpOf(data).serverTokens.find((x) => x.id === id);
    if (!t) throw new WorkspaceError("Jeton introuvable.", 404);
    t.revokedAt = nowIso();
    log(data, t.companyId, actor, "mcp.jeton", `Jeton MCP « ${t.name} » révoqué.`);
    return { ok: true };
  });
}

export async function tokenCompany(id: string) {
  const { mcp } = await readMcp();
  return mcp.serverTokens.find((t) => t.id === id)?.companyId ?? null;
}

export async function verifyServerToken(authorization: string | null): Promise<McpServerToken | null> {
  const raw = authorization?.match(/^Bearer\s+(cf_mcp_[A-Za-z0-9_-]+)$/)?.[1];
  if (!raw) return null;
  const hash = sha256(raw);
  const { data, mcp } = await readMcp();
  const token = mcp.serverTokens.find((t) => t.tokenHash === hash && !t.revokedAt);
  if (!token || !data.companies.some((c) => c.id === token.companyId)) return null;
  if (!token.lastUsedAt || Date.now() - new Date(token.lastUsedAt).getTime() > 60_000) {
    await withData((d) => {
      const t = mcpOf(d).serverTokens.find((x) => x.id === token.id);
      if (t) t.lastUsedAt = nowIso();
    });
  }
  return token;
}

/* ------------------------------------------------------------------ Serveur */

function toolList(token: McpServerToken) {
  const published = Object.entries(PUBLISHED)
    .filter(([name, scope]) => token.scopes.includes(scope) && TOOL_MAP.has(name))
    .map(([name, scope]) => {
      const t = TOOL_MAP.get(name)!;
      return { name, description: t.description, inputSchema: t.parameters, annotations: { readOnlyHint: scope === "lecture", openWorldHint: false } };
    });
  const extra = EXTRA_TOOLS.filter((t) => token.scopes.includes(t.scope)).map(({ scope, ...t }) => ({ ...t, annotations: { readOnlyHint: scope === "lecture" } }));
  return [...published, ...extra];
}

async function runTool(token: McpServerToken, name: string, args: Record<string, unknown>) {
  const scope = PUBLISHED[name] ?? EXTRA_TOOLS.find((t) => t.name === name)?.scope;
  if (!scope || !token.scopes.includes(scope)) throw new WorkspaceError(`Outil non autorisé pour ce jeton : ${name}`, 403);
  if (name === "lister_approbations") {
    const { data } = await readMcp();
    const pending = data.approvals.filter((a) => a.companyId === token.companyId && a.status === "en_attente");
    return { resume: `${pending.length} approbation(s) en attente`, donnees: pending.map((a) => ({ id: a.id, type: a.type, titre: a.title, resume: a.summary, demande_par: a.requestedBy, date: a.createdAt })) };
  }
  if (name === "decider_approbation") {
    const { data } = await readMcp();
    const approval = data.approvals.find((a) => a.id === String(args.approbation_id ?? ""));
    if (!approval || approval.companyId !== token.companyId) throw new WorkspaceError("Approbation introuvable.", 404);
    const member = data.members.find((m) => m.id === token.memberId && m.companyId === token.companyId);
    if (!member || member.role === "lecteur") throw new WorkspaceError("Membre du jeton invalide.", 403);
    const decision = args.decision === "approuver" ? "approuver" : "rejeter";
    const res = await decideApproval(approval.id, decision, `${member.name} (via MCP)`, typeof args.note === "string" ? args.note : undefined);
    return { resume: `Approbation ${decision === "approuver" ? "validée" : "rejetée"}`, donnees: res };
  }
  const tool = TOOL_MAP.get(name)!;
  const ctx: ToolContext = { companyId: token.companyId, citations: [], groundings: [] };
  const result = await tool.run(args, ctx);
  return {
    resume: result.summary,
    donnees: result.data,
    citations: ctx.citations.map((c) => ({ id: c.id, document: c.legalTitle ?? c.title, page: c.page, articles: c.articles, exemple_non_officiel: c.isExample, fichier: c.file })),
  };
}

export function buildCofounderServer(token: McpServerToken) {
  const server = new Server(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions:
      "Co-founder : co-fondateur IA ancré sur le corpus juridique officiel. Appelez d'abord rechercher_textes_juridiques et citez les sources [Sx] (document, page, article). Si le statut est non_couvert, dites-le. Les actions externes (emails, devis, réponses) attendent une validation humaine.",
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList(token) as never }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const started = Date.now();
    try {
      const out = await runTool(token, req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>);
      await withData((d) => log(d, token.companyId, `mcp:${token.name}`, "mcp.appel", `${req.params.name} (${Date.now() - started} ms).`));
      return { content: [{ type: "text", text: JSON.stringify(out).slice(0, 60000) }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Erreur" }] };
    }
  });
  return server;
}

/** Traite une requête HTTP MCP (POST JSON-RPC ; GET/DELETE → 405 en mode sans état). */
export async function handleMcpHttp(request: Request): Promise<Response> {
  const unauthorized = () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Jeton Co-founder invalide ou absent (Authorization: Bearer cf_mcp_…)." }, id: null }), {
      status: 401,
      headers: { "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="co-founder-mcp"' },
    });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Méthode non prise en charge (serveur sans état)." }), { status: 405, headers: { Allow: "POST", "Content-Type": "application/json" } });
  const token = await verifyServerToken(request.headers.get("authorization"));
  if (!token) return unauthorized();
  const server = buildCofounderServer(token);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  }
}
