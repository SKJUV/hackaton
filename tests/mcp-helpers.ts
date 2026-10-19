import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { vi } from "vitest";

export type Handler = (req: Request) => Response | Promise<Response>;
export type Recorded = { method: string; url: string; headers: Headers; body: string };

/**
 * Mock HTTP : chaque requête sortante est routée vers un gestionnaire local ; toute requête non prévue
 * échoue (garantit qu'aucun appel réseau réel ni envoi réel n'a lieu pendant les tests).
 */
export function mockNetwork(routes: [string | RegExp, Handler][]) {
  const calls: Recorded[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const body = req.method === "GET" || req.method === "HEAD" ? "" : await req.clone().text();
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    const hit = routes.find(([m]) => (typeof m === "string" ? req.url.startsWith(m) : m.test(req.url)));
    if (!hit) throw new Error(`Réseau interdit en test : ${req.method} ${req.url}`);
    return hit[1](req);
  });
  return calls;
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });

/** Faux serveur MCP distant (SDK officiel, Streamable HTTP) : un outil lecture seule + un outil d'écriture. */
export function fakeMcpServer(opts: { requireBearer?: string; onCall?: (name: string, args: unknown) => void } = {}): Handler {
  return async (req) => {
    if (opts.requireBearer && req.headers.get("authorization") !== `Bearer ${opts.requireBearer}`) {
      const origin = new URL(req.url).origin;
      return new Response("unauthorized", { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` } });
    }
    const server = new Server({ name: "faux-serveur", version: "0.1.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        { name: "lire_fiche", description: "Lit une fiche", inputSchema: { type: "object", properties: { id: { type: "string" } } }, annotations: { readOnlyHint: true } },
        { name: "creer_fiche", description: "Crée une fiche", inputSchema: { type: "object", properties: { titre: { type: "string" } } } },
      ],
    }));
    server.setRequestHandler(CallToolRequestSchema, async (r) => {
      opts.onCall?.(r.params.name, r.params.arguments);
      return { content: [{ type: "text", text: `ok:${r.params.name}:${JSON.stringify(r.params.arguments)}` }] };
    });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    return transport.handleRequest(req);
  };
}
