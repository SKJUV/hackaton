import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./setup-db";
import { fakeMcpServer, json, mockNetwork } from "./mcp-helpers";
import { decideApproval, getSnapshot } from "@/lib/workspace/service";
import { createConnection, invokeConnectorTool, patchConnection, testConnection } from "@/lib/modules/mcp/connectors";
import { connectorAgentTools } from "@/lib/modules/mcp/agent-tools";
import { assertSafeMcpUrl } from "@/lib/modules/mcp/client";
import { decryptString, encryptString, openBag } from "@/lib/modules/mcp/crypto";
import { listCalls } from "@/lib/modules/mcp/connectors";
import { finishOAuth, startOAuth } from "@/lib/modules/mcp/oauth-flow";
import { publicConnection, readMcp } from "@/lib/modules/mcp/repo";
import { createServerToken, handleMcpHttp } from "@/lib/modules/mcp/server";
import { MCP_CATALOG } from "@/lib/modules/mcp/catalog";

const CO = "co_kmerlog";

describe("mcp — client, serveur, OAuth, approbations", () => {
  beforeEach(() => {
    useTempDb();
    process.env.APP_URL = "https://app.cofounder.test";
    delete process.env.CONNECTORS_ENCRYPTION_KEY;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("chiffre les secrets au repos et ne les expose jamais", async () => {
    const enc = encryptString("secret-123");
    expect(enc).not.toContain("secret-123");
    expect(decryptString(enc)).toBe("secret-123");
    const tampered = enc.slice(0, -4) + (enc.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptString(tampered)).toThrow();
    const conn = await createConnection(CO, { url: "https://mcp.exemple.test/mcp", bearer: "tok-super-secret" }, "test");
    expect(JSON.stringify(publicConnection(conn))).not.toContain("tok-super-secret");
    expect(publicConnection(conn)).toMatchObject({ hasBearer: true });
    expect(readFileSync(process.env.WORKSPACE_DB_PATH!, "utf8")).not.toContain("tok-super-secret");
    expect(openBag(conn.secret).bearer).toBe("tok-super-secret");
  });

  it("refuse les URL non https ou réseau privé (anti-SSRF)", () => {
    expect(() => assertSafeMcpUrl("http://mcp.exemple.test/mcp")).toThrow(/https/);
    expect(() => assertSafeMcpUrl("https://169.254.169.254/latest")).toThrow(/privée/);
    expect(() => assertSafeMcpUrl("https://10.0.0.2/mcp")).toThrow(/privée/);
    expect(assertSafeMcpUrl("https://mcp.notion.com/mcp").hostname).toBe("mcp.notion.com");
  });

  it("catalogue : URLs MCP officielles uniquement en https, avec documentation", () => {
    for (const e of MCP_CATALOG) {
      expect(e.url).toMatch(/^https:\/\//);
      expect(e.docsUrl).toMatch(/^https:\/\//);
    }
    expect(MCP_CATALOG.find((e) => e.id === "notion-mcp")?.url).toBe("https://mcp.notion.com/mcp");
  });

  it("serveur MCP Co-founder : jeton par entreprise, outils juridiques/workspace, écritures → approbation", async () => {
    const { token } = await createServerToken(CO, { name: "Claude" }, "test");
    mockNetwork([["https://cofounder.example.com/api/mcp/server", (req) => handleMcpHttp(req)]]);
    // Co-founder se connecte à son propre serveur via le client MCP (SDK) — boucle MCP réelle, en mémoire.
    const conn = await createConnection(CO, { url: "https://cofounder.example.com/api/mcp/server", bearer: token, transport: "streamable_http" }, "test");
    const test = await testConnection(conn.id);
    expect(test).toMatchObject({ ok: true, status: "connecte" });
    const { mcp } = await readMcp();
    const tools = mcp.connections.find((c) => c.id === conn.id)!.tools;
    expect(tools.find((t) => t.name === "rechercher_textes_juridiques")?.write).toBe(false);
    expect(tools.find((t) => t.name === "creer_tache")?.write).toBe(true);
    expect(tools.some((t) => t.name === "decider_approbation")).toBe(false); // portée non accordée

    const read = await invokeConnectorTool(CO, conn.id, "rechercher_textes_juridiques", { question: "licence opérateur télécommunications" }, "test");
    expect(read.pending).toBe(false);
    expect(JSON.stringify((read as { result: unknown }).result)).toContain("resume");

    const write = await invokeConnectorTool(CO, conn.id, "creer_tache", { titre: "Tâche créée via MCP" }, "agent");
    expect(write.pending).toBe(true);
    let snap = await getSnapshot(CO);
    expect(snap.tasks.some((t) => t.title === "Tâche créée via MCP")).toBe(false);
    const res = await decideApproval((write as { approvalId: string }).approvalId, "approuver", "Freddy");
    expect(res).toMatchObject({ status: "approuvee", callStatus: "succes" });
    snap = await getSnapshot(CO);
    expect(snap.tasks.some((t) => t.title === "Tâche créée via MCP")).toBe(true);
    const calls = await listCalls(CO);
    expect(calls.map((c) => c.status)).toEqual(expect.arrayContaining(["succes"]));
    expect(JSON.stringify(calls)).not.toContain(token);
  });

  it("serveur MCP : 401 sans jeton valide, 405 en GET, portée approbation liée à un membre", async () => {
    const bad = await handleMcpHttp(new Request("https://x.test/api/mcp/server", { method: "POST", headers: { Authorization: "Bearer cf_mcp_faux", "Content-Type": "application/json" }, body: "{}" }));
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toMatch(/Bearer/);
    expect((await handleMcpHttp(new Request("https://x.test/api/mcp/server"))).status).toBe(405);
    await expect(createServerToken(CO, { name: "x", scopes: ["approbation"] }, "t")).rejects.toThrow(/membre/);
    const ok = await createServerToken(CO, { name: "x", scopes: ["lecture", "approbation"], memberId: "mem_freddy" }, "t");
    expect(ok.token).toMatch(/^cf_mcp_/);
    expect(JSON.stringify((await readMcp()).mcp.serverTokens)).not.toContain(ok.token);
  });

  it("découverte dynamique : outils exposés à l'agent ; lecture directe, écriture approuvée/rejetée", async () => {
    const seen: string[] = [];
    mockNetwork([["https://mcp.partenaire.test/mcp", fakeMcpServer({ onCall: (n) => seen.push(n) })]]);
    const conn = await createConnection(CO, { name: "Partenaire", url: "https://mcp.partenaire.test/mcp", authMode: "none" }, "test");
    await testConnection(conn.id);
    const agentTools = await connectorAgentTools(CO);
    const lire = agentTools.find((t) => t.name.endsWith("_lire_fiche"))!;
    const creer = agentTools.find((t) => t.name.endsWith("_creer_fiche"))!;
    expect(lire.external).toBe(false);
    expect(creer.external).toBe(true);
    const ctx = { companyId: CO, citations: [] };
    await lire.run({ id: "42" }, ctx);
    expect(seen).toEqual(["lire_fiche"]);
    const pending = (await creer.run({ titre: "A" }, ctx)).data as { approbation: string };
    expect(seen).toEqual(["lire_fiche"]);
    await decideApproval(pending.approbation, "rejeter", "Freddy");
    expect(seen).toEqual(["lire_fiche"]);
    const p2 = (await creer.run({ titre: "B" }, ctx)).data as { approbation: string };
    await decideApproval(p2.approbation, "approuver", "Freddy");
    expect(seen).toEqual(["lire_fiche", "creer_fiche"]);
    // Désactivation par entreprise → plus aucun outil exposé.
    await patchConnection(conn.id, { enabled: false }, "test");
    expect(await connectorAgentTools(CO)).toHaveLength(0);
    await expect(invokeConnectorTool(CO, conn.id, "lire_fiche", {}, "t")).rejects.toThrow(/désactivé/);
  });

  it("OAuth 2.1 MCP : découverte, enregistrement dynamique, PKCE S256, jetons chiffrés", async () => {
    const AS = "https://auth.oauth.test";
    const RS = "https://mcp.oauth.test";
    let tokenBody = "";
    mockNetwork([
      [`${RS}/.well-known/oauth-protected-resource`, () => json({ resource: `${RS}/mcp`, authorization_servers: [AS] })],
      [`${AS}/.well-known/oauth-authorization-server`, () => json({ issuer: AS, authorization_endpoint: `${AS}/authorize`, token_endpoint: `${AS}/token`, registration_endpoint: `${AS}/register`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"] })],
      [`${AS}/register`, async (req) => json({ ...(await req.json()), client_id: "client-dynamique-1" }, 201)],
      [`${AS}/token`, async (req) => {
        tokenBody = await req.text();
        return json({ access_token: "jeton-acces-oauth", token_type: "Bearer", expires_in: 3600, refresh_token: "jeton-refresh" });
      }],
      [`${RS}/mcp`, fakeMcpServer({ requireBearer: "jeton-acces-oauth" })],
      [/\/\.well-known\//, () => new Response("not found", { status: 404 })],
    ]);
    const conn = await createConnection(CO, { name: "Serveur OAuth", url: `${RS}/mcp`, authMode: "oauth" }, "test");
    expect(conn.status).toBe("autorisation_requise");
    const start = await startOAuth(conn.id, undefined, "test");
    const url = new URL((start as { authorizationUrl: string }).authorizationUrl);
    expect(url.origin + url.pathname).toBe(`${AS}/authorize`);
    expect(url.searchParams.get("client_id")).toBe("client-dynamique-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.cofounder.test/api/mcp/oauth/callback");
    const state = url.searchParams.get("state")!;
    await expect(finishOAuth("etat-inconnu", "x", null, () => true)).rejects.toThrow(/expirée|inconnue/);
    const done = await finishOAuth(state, "code-ok", null, () => true);
    expect(done.ok).toBe(true);
    expect(tokenBody).toContain("code_verifier=");
    expect(tokenBody).toContain("code=code-ok");
    const { mcp } = await readMcp();
    const saved = mcp.connections.find((c) => c.id === conn.id)!;
    expect(saved.status).toBe("connecte");
    expect(saved.tools).toHaveLength(2);
    expect(readFileSync(process.env.WORKSPACE_DB_PATH!, "utf8")).not.toContain("jeton-acces-oauth");
    // Le state est à usage unique.
    await expect(finishOAuth(state, "code-ok", null, () => true)).rejects.toThrow();
  });
});
