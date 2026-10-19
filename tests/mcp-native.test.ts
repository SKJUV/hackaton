import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./setup-db";
import { json, mockNetwork } from "./mcp-helpers";
import { decideApproval, getSnapshot } from "@/lib/workspace/service";
import { createConnection, executeTool, invokeConnectorTool, testConnection } from "@/lib/modules/mcp/connectors";
import { finishOAuth, startOAuth } from "@/lib/modules/mcp/oauth-flow";
import { classify, ingestWhatsAppWebhook, listInbox, prepareReply, syncInbox } from "@/lib/modules/mcp/inbox";
import { readMcp, updateConnection } from "@/lib/modules/mcp/repo";
import { openBag, sealBag } from "@/lib/modules/mcp/crypto";
import { verifyWhatsAppSignature, whatsappVerifyChallenge } from "@/lib/modules/mcp/webhooks";
import { connectorAgentTools } from "@/lib/modules/mcp/agent-tools";
import { TOOL_MAP } from "@/lib/agent/tools";
import { runAgent } from "@/lib/agent/runner";

const CO = "co_kmerlog";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "CONNECTORS_SEND_MODE", "META_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];

describe("connecteurs natifs (API officielles, mocks HTTP)", () => {
  beforeEach(() => {
    useTempDb();
    process.env.APP_URL = "https://app.cofounder.test";
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sans OAuth ni jeton : mode DÉMO marqué, outils exposés à l'agent", async () => {
    mockNetwork([]); // aucun réseau autorisé
    const conn = await createConnection(CO, { catalogId: "gmail" }, "test");
    expect(conn).toMatchObject({ demo: true, status: "demo" });
    const r = await invokeConnectorTool(CO, conn.id, "gmail_lister_messages", {}, "test");
    expect(r).toMatchObject({ pending: false, status: "demo" });
    expect(JSON.stringify((r as { result: unknown }).result)).toContain("DÉMO");
    const tools = await connectorAgentTools(CO);
    expect(tools.some((t) => t.description.includes("DÉMO"))).toBe(true);
  });

  it("Gmail : lecture réelle (Bearer), envoi → approbation puis SIMULATION par défaut, réel en mode live", async () => {
    const calls = mockNetwork([
      [`${GMAIL}/profile`, () => json({ emailAddress: "freddy@exemple.test" })],
      [`${GMAIL}/messages/send`, () => json({ id: "sent-1", threadId: "t1" })],
      [`${GMAIL}/messages?`, () => json({ messages: [{ id: "m1", threadId: "t1" }] })],
      [`${GMAIL}/messages/m1`, () => json({ id: "m1", threadId: "t1", snippet: "Votre facture est impayée, dernier rappel", internalDate: String(Date.now()), payload: { headers: [{ name: "From", value: "Compta <compta@client.test>" }, { name: "Subject", value: "Facture impayée" }] } })],
    ]);
    const conn = await createConnection(CO, { catalogId: "gmail", bearer: "ya29.jeton-test" }, "test");
    expect(conn.demo).toBe(false);
    expect(await testConnection(conn.id)).toMatchObject({ ok: true, status: "connecte", account: "freddy@exemple.test" });
    const list = await invokeConnectorTool(CO, conn.id, "gmail_lister_messages", { requete: "is:unread" }, "test");
    expect((list as { result: { subject: string }[] }).result[0].subject).toBe("Facture impayée");
    expect(calls.find((c) => c.url.includes("/messages?"))!.headers.get("authorization")).toBe("Bearer ya29.jeton-test");
    expect(calls.find((c) => c.url.includes("/messages?"))!.url).toContain("q=is%3Aunread");

    const send = await invokeConnectorTool(CO, conn.id, "gmail_envoyer", { a: ["client@exemple.test"], objet: "Bonjour é", corps: "Corps du message" }, "agent");
    expect(send.pending).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/messages/send"))).toBe(false);
    const sim = await decideApproval((send as { approvalId: string }).approvalId, "approuver", "Freddy");
    expect(sim).toMatchObject({ callStatus: "simule" });
    expect(calls.some((c) => c.url.endsWith("/messages/send"))).toBe(false);

    process.env.CONNECTORS_SEND_MODE = "live";
    const send2 = await invokeConnectorTool(CO, conn.id, "gmail_envoyer", { a: ["client@exemple.test"], objet: "Bonjour é", corps: "Corps du message" }, "agent");
    const live = await decideApproval((send2 as { approvalId: string }).approvalId, "approuver", "Freddy");
    expect(live).toMatchObject({ callStatus: "succes" });
    const sent = calls.find((c) => c.url.endsWith("/messages/send"))!;
    const raw = Buffer.from(JSON.parse(sent.body).raw, "base64url").toString("utf8");
    expect(raw).toContain("To: client@exemple.test");
    expect(raw).toContain("Subject: =?UTF-8?B?");
  });

  it("OAuth Google : URL avec PKCE + offline, échange du code, rafraîchissement automatique du jeton", async () => {
    process.env.GOOGLE_CLIENT_ID = "id-google";
    process.env.GOOGLE_CLIENT_SECRET = "secret-google";
    const bodies: string[] = [];
    mockNetwork([
      ["https://oauth2.googleapis.com/token", async (req) => {
        const b = await req.text();
        bodies.push(b);
        return b.includes("grant_type=refresh_token") ? json({ access_token: "acces-2", expires_in: 3600, token_type: "Bearer" }) : json({ access_token: "acces-1", refresh_token: "refresh-1", expires_in: 3600, token_type: "Bearer" });
      }],
      [`${GMAIL}/profile`, () => json({ emailAddress: "freddy@exemple.test" })],
      [`${GMAIL}/messages?`, (req) => (req.headers.get("authorization") === "Bearer acces-2" ? json({ messages: [] }) : json({ error: { message: "expired" } }, 401))],
    ]);
    const conn = await createConnection(CO, { catalogId: "gmail" }, "test");
    expect(conn).toMatchObject({ demo: false, status: "autorisation_requise" });
    const { authorizationUrl } = (await startOAuth(conn.id, undefined, "test")) as { authorizationUrl: string };
    const url = new URL(authorizationUrl);
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("gmail.send");
    const done = await finishOAuth(url.searchParams.get("state")!, "code-google", null, () => true);
    expect(done.ok).toBe(true);
    expect(bodies[0]).toContain("code_verifier=");
    expect(bodies[0]).toContain("client_secret=secret-google");
    // Jeton expiré → rafraîchi avant l'appel.
    await updateConnection(conn.id, (c) => {
      const bag = openBag(c.secret);
      bag.tokens = { ...bag.tokens!, expires_at: Date.now() - 1000 };
      c.secret = sealBag(bag);
    });
    const r = await invokeConnectorTool(CO, conn.id, "gmail_lister_messages", {}, "test");
    expect(r).toMatchObject({ pending: false, status: "succes" });
    expect(bodies.some((b) => b.includes("grant_type=refresh_token") && b.includes("refresh_token=refresh-1"))).toBe(true);
    expect(readFileSync(process.env.WORKSPACE_DB_PATH!, "utf8")).not.toContain("acces-2");
  });

  it("WhatsApp Cloud API : webhook signé → boîte unifiée → réponse approuvée envoyée (mode live)", async () => {
    process.env.META_APP_SECRET = "app-secret";
    process.env.WHATSAPP_VERIFY_TOKEN = "verif";
    const calls = mockNetwork([[/graph\.facebook\.com\/v\d+\.\d+\/123456\/messages/, () => json({ messages: [{ id: "wamid.1" }] })]]);
    const params = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "verif", "hub.challenge": "42" });
    expect(whatsappVerifyChallenge(params)).toBe("42");
    params.set("hub.verify_token", "faux");
    expect(whatsappVerifyChallenge(params)).toBeNull();

    const conn = await createConnection(CO, { catalogId: "whatsapp", bearer: "EAAG-jeton", config: { phoneNumberId: "123456" } }, "test");
    const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456" }, contacts: [{ wa_id: "237699000000", profile: { name: "Awa" } }], messages: [{ id: "wamid.in1", from: "237699000000", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Bonjour, ma commande n'est pas arrivée, c'est urgent" } }] } }] }] };
    const raw = JSON.stringify(payload);
    expect(verifyWhatsAppSignature(raw, `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`)).toBe(true);
    expect(verifyWhatsAppSignature(raw, "sha256=00")).toBe(false);
    expect(await ingestWhatsAppWebhook(payload)).toEqual({ stored: 1, ignored: 0 });
    expect(await ingestWhatsAppWebhook(payload)).toEqual({ stored: 0, ignored: 0 }); // dédoublonnage

    const inbox = await listInbox(CO);
    const msg = inbox.messages.find((m) => m.externalId === "wamid.in1")!;
    expect(msg).toMatchObject({ channel: "whatsapp", category: "client", priority: "haute", connectionId: conn.id });

    process.env.CONNECTORS_SEND_MODE = "live";
    const reply = await prepareReply(msg.id, { routine: "accuse_reception" }, "Freddy");
    expect(calls).toHaveLength(0);
    await decideApproval(reply.approvalId, "approuver", "Freddy");
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0].body);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "237699000000", type: "text" });
    expect(body.text.body).toContain("Awa");
    expect(calls[0].headers.get("authorization")).toBe("Bearer EAAG-jeton");
    expect((await listInbox(CO)).messages.find((m) => m.id === msg.id)!.status).toBe("traite");
  });

  it("Slack, Notion, HubSpot, Outlook : requêtes conformes aux API officielles", async () => {
    const calls = mockNetwork([
      ["https://slack.com/api/conversations.list", () => json({ ok: false, error: "missing_scope" })],
      ["https://api.notion.com/v1/search", () => json({ results: [{ id: "p1", object: "page", url: "https://notion.so/p1", properties: { Name: { type: "title", title: [{ plain_text: "Plan" }] } } }] })],
      ["https://api.hubapi.com/crm/v3/objects/contacts", () => json({ id: "501" })],
      ["https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages", () => json({ value: [{ id: "o1", subject: "Partenariat", from: { emailAddress: { name: "Ana", address: "ana@x.test" } }, receivedDateTime: new Date().toISOString(), bodyPreview: "Proposition de partenariat" }] })],
    ]);
    const slack = await createConnection(CO, { catalogId: "slack", bearer: "xoxb-test" }, "t");
    await expect(invokeConnectorTool(CO, slack.id, "slack_lister_canaux", {}, "t")).rejects.toThrow(/missing_scope/);

    const notion = await createConnection(CO, { catalogId: "notion", bearer: "secret_notion" }, "t");
    const n = await invokeConnectorTool(CO, notion.id, "notion_rechercher", { requete: "Plan" }, "t");
    expect((n as { result: { titre: string }[] }).result[0].titre).toBe("Plan");
    expect(calls.find((c) => c.url.includes("notion"))!.headers.get("notion-version")).toBeTruthy();

    const hs = await createConnection(CO, { catalogId: "hubspot", bearer: "pat-hubspot" }, "t");
    const pending = await invokeConnectorTool(CO, hs.id, "hubspot_creer_contact", { email: "awa@x.test", prenom: "Awa" }, "agent");
    expect(pending.pending).toBe(true);
    await decideApproval((pending as { approvalId: string }).approvalId, "approuver", "Freddy");
    expect(JSON.parse(calls.find((c) => c.url.includes("hubapi"))!.body)).toMatchObject({ properties: { email: "awa@x.test", firstname: "Awa" } });

    const ol = await createConnection(CO, { catalogId: "outlook", bearer: "eyJ-ms" }, "t");
    await updateConnection(ol.id, (c) => void (c.status = "connecte"));
    const sync = await syncInbox(CO, "t");
    expect(sync.sources[0]).toMatchObject({ ajoutes: 1 });
    const inbox = await listInbox(CO);
    expect(inbox.messages.find((m) => m.externalId === "o1")).toMatchObject({ provider: "outlook", category: "partenariat", routine: "confirmation_partenariat" });
    const logs = (await readMcp()).mcp.calls;
    expect(JSON.stringify(logs)).not.toMatch(/xoxb-test|secret_notion|pat-hubspot|eyJ-ms/);
  });

  it("boîte unifiée : démo marquée, classement, priorité, routines → approbations", async () => {
    mockNetwork([]);
    const inbox = await listInbox(CO);
    expect(inbox.messages.length).toBeGreaterThan(3);
    expect(inbox.messages.every((m) => m.isExample)).toBe(true);
    expect(inbox.messages[0].priority).toBe("haute");
    expect(classify({ subject: "Offre spéciale", body: "newsletter — se désabonner", channel: "email" }).priority).toBe("basse");
    expect(classify({ subject: "Candidature", body: "mon CV pour un stage", channel: "email" }).routine).toBe("refus_candidature");
    const email = inbox.messages.find((m) => m.category === "candidature")!;
    const r1 = await prepareReply(email.id, { routine: "refus_candidature" }, "Freddy");
    let snap = await getSnapshot(CO);
    expect(snap.approvals.find((a) => a.id === r1.approvalId)?.type).toBe("envoi_email");
    const wa = inbox.messages.find((m) => m.channel === "whatsapp")!;
    const r2 = await prepareReply(wa.id, {}, "Freddy");
    snap = await getSnapshot(CO);
    const appr = snap.approvals.find((a) => a.id === r2.approvalId)!;
    expect(appr.type).toBe("action_connecteur");
    expect(appr.action?.tool).toBe("whatsapp_envoyer_texte");
    expect(await decideApproval(appr.id, "approuver", "Freddy")).toMatchObject({ callStatus: "demo" });
  });

  it("agent : outils du module enregistrés, agent démo inchangé et fonctionnel", async () => {
    mockNetwork([]);
    for (const name of ["lister_connecteurs", "boite_unifiee", "synchroniser_boite", "preparer_reponse"]) expect(TOOL_MAP.has(name)).toBe(true);
    const r = await TOOL_MAP.get("boite_unifiee")!.run({}, { companyId: CO, citations: [] });
    expect(r.summary).toMatch(/DÉMO/);
    const snap = await getSnapshot(CO);
    const reply = await runAgent(snap.company, [{ role: "user", content: "Fais-moi le briefing du jour" }]);
    expect(reply.mode).toBe("demo");
  });

  it("refus de mode réel incohérent : WhatsApp par jeton exige le phone_number_id", async () => {
    await expect(createConnection(CO, { catalogId: "whatsapp", bearer: "x" }, "t")).rejects.toThrow(/phone_number_id/);
    const c = await createConnection(CO, { catalogId: "whatsapp", demo: true }, "t");
    const out = await executeTool(c, "whatsapp_envoyer_texte", { a: "237600000000", texte: "x" });
    expect(out.status).toBe("demo");
  });
});

describe("planificateur démo — boîte unifiée", () => {
  beforeEach(useTempDb);
  it("« mes messages reçus » → outil boite_unifiee", async () => {
    const snap = await getSnapshot(CO);
    const reply = await runAgent(snap.company, [{ role: "user", content: "Montre-moi les messages reçus dans la boîte unifiée" }]);
    expect(reply.toolTrace.some((t) => t.tool === "boite_unifiee")).toBe(true);
    expect(reply.answer).toContain("Boîte unifiée");
  });
});
