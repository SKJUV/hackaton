import { env } from "../config";
import type { CachedTool, NativeProvider } from "../types";
import { apiFetch, ConnectorHttpError } from "./http";

/**
 * Connecteurs natifs : appels aux API OFFICIELLES (Gmail, Google Calendar, Microsoft Graph,
 * WhatsApp Business Cloud API, Slack Web API, Notion API, HubSpot CRM API).
 * Chaque outil a une variante `demo` (données fictives marquées) utilisée sans clé/OAuth.
 */
export type Args = Record<string, unknown>;
export type NativeCtx = { token: string; config: Record<string, string> };
export type NativeTool = CachedTool & { run: (a: Args, ctx: NativeCtx) => Promise<unknown>; demo: (a: Args) => unknown };

const s = (v: unknown, d = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const n = (v: unknown, d: number, max = 50) => Math.min(Math.max(typeof v === "number" ? v : Number(v) || d, 1), max);
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : s(v).split(/[,;\s]+/).filter(Boolean));
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const str = (description: string) => ({ type: "string", description });
const DEMO = "DÉMO — données fictives : connecteur non branché (ajoutez les variables d'env / l'OAuth pour les vraies données).";
const demoWrap = (data: unknown) => ({ demo: true, avertissement: DEMO, donnees: data });
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

/* ------------------------------------------------------------------ Gmail */

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

function encodeHeader(v: string) {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

/** Message RFC 2822 encodé en base64url, format exigé par l'API Gmail (champ `raw`). */
export function buildRawEmail(m: { to: string[]; subject: string; body: string; cc?: string[]; inReplyTo?: string }) {
  const lines = [
    `To: ${m.to.join(", ")}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
    "",
    Buffer.from(m.body, "utf8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };
function gmailText(part?: GmailPart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const p of part.parts ?? []) {
    const t = gmailText(p);
    if (t) return t;
  }
  if (part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8").replace(/<[^>]+>/g, " ");
  return "";
}
const header = (p: GmailPart | undefined, name: string) => p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

export type MailSummary = { id: string; threadId?: string; from: string; subject: string; date: string; snippet: string; messageId?: string };

export async function gmailList(ctx: NativeCtx, query: string, max: number): Promise<MailSummary[]> {
  const url = new URL(`${GMAIL}/messages`);
  url.searchParams.set("maxResults", String(max));
  if (query) url.searchParams.set("q", query);
  const listRes = await apiFetch<{ messages?: { id: string; threadId: string }[] }>("Gmail", url.toString(), { token: ctx.token });
  const out: MailSummary[] = [];
  for (const m of listRes.messages ?? []) {
    const msg = await apiFetch<{ id: string; threadId: string; snippet?: string; internalDate?: string; payload?: GmailPart }>(
      "Gmail",
      `${GMAIL}/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
      { token: ctx.token },
    );
    out.push({
      id: msg.id,
      threadId: msg.threadId,
      from: header(msg.payload, "From"),
      subject: header(msg.payload, "Subject"),
      date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : header(msg.payload, "Date"),
      snippet: msg.snippet ?? "",
      messageId: header(msg.payload, "Message-ID") || undefined,
    });
  }
  return out;
}

const DEMO_MAILS: MailSummary[] = [
  { id: "demo-g1", threadId: "demo-t1", from: "Client Démo <client@exemple.example.com>", subject: "Commande en attente", date: ago(3), snippet: "Bonjour, où en est ma commande ?" },
];

const gmail: NativeTool[] = [
  {
    name: "gmail_lister_messages",
    description: "Liste les derniers emails de la boîte Gmail (filtre de recherche Gmail optionnel, ex. « is:unread »).",
    inputSchema: obj({ requete: str("Requête Gmail (ex. is:unread newer_than:7d)"), max: { type: "number", description: "1 à 25" } }),
    write: false,
    run: (a, ctx) => gmailList(ctx, s(a.requete), n(a.max, 10, 25)),
    demo: () => demoWrap(DEMO_MAILS),
  },
  {
    name: "gmail_lire_message",
    description: "Lit le contenu complet d'un email Gmail par identifiant.",
    inputSchema: obj({ id: str("Identifiant du message") }, ["id"]),
    write: false,
    async run(a, ctx) {
      const msg = await apiFetch<{ id: string; threadId: string; payload?: GmailPart }>("Gmail", `${GMAIL}/messages/${encodeURIComponent(s(a.id))}?format=full`, { token: ctx.token });
      return { id: msg.id, threadId: msg.threadId, from: header(msg.payload, "From"), subject: header(msg.payload, "Subject"), date: header(msg.payload, "Date"), messageId: header(msg.payload, "Message-ID"), corps: gmailText(msg.payload).slice(0, 8000) };
    },
    demo: (a) => demoWrap({ id: s(a.id), corps: "Bonjour, où en est ma commande ? (exemple)" }),
  },
  {
    name: "gmail_creer_brouillon",
    description: "Crée un brouillon dans Gmail (écriture : soumis à approbation).",
    inputSchema: obj({ a: { type: "array", items: { type: "string" } }, objet: str("Objet"), corps: str("Corps"), thread_id: str("Fil Gmail (réponse)") }, ["a", "objet", "corps"]),
    write: true,
    async run(a, ctx) {
      const raw = buildRawEmail({ to: list(a.a), subject: s(a.objet), body: s(a.corps), inReplyTo: s(a.in_reply_to) || undefined });
      const r = await apiFetch<{ id: string }>("Gmail", `${GMAIL}/drafts`, { token: ctx.token, json: { message: { raw, ...(s(a.thread_id) ? { threadId: s(a.thread_id) } : {}) } } });
      return { brouillon: r.id };
    },
    demo: (a) => demoWrap({ brouillon: "demo-draft", objet: s(a.objet) }),
  },
  {
    name: "gmail_envoyer",
    description: "Envoie un email depuis Gmail (envoi à un tiers : approbation + mode d'envoi réel requis).",
    inputSchema: obj({ a: { type: "array", items: { type: "string" } }, objet: str("Objet"), corps: str("Corps"), thread_id: str("Fil Gmail (réponse)"), in_reply_to: str("Message-ID d'origine") }, ["a", "objet", "corps"]),
    write: true,
    sends: true,
    async run(a, ctx) {
      const raw = buildRawEmail({ to: list(a.a), subject: s(a.objet), body: s(a.corps), inReplyTo: s(a.in_reply_to) || undefined });
      const r = await apiFetch<{ id: string; threadId: string }>("Gmail", `${GMAIL}/messages/send`, { token: ctx.token, json: { raw, ...(s(a.thread_id) ? { threadId: s(a.thread_id) } : {}) } });
      return { envoye: true, id: r.id, threadId: r.threadId };
    },
    demo: (a) => demoWrap({ envoye: false, objet: s(a.objet) }),
  },
];

/* --------------------------------------------------------- Google Calendar */

const GCAL = "https://www.googleapis.com/calendar/v3/calendars";
const gcal: NativeTool[] = [
  {
    name: "gcal_lister_evenements",
    description: "Liste les événements à venir de l'agenda Google principal.",
    inputSchema: obj({ jours: { type: "number", description: "Horizon en jours (défaut 14)" } }),
    write: false,
    async run(a, ctx) {
      const url = new URL(`${GCAL}/${encodeURIComponent(ctx.config.calendarId || "primary")}/events`);
      url.searchParams.set("timeMin", new Date().toISOString());
      url.searchParams.set("timeMax", new Date(Date.now() + n(a.jours, 14, 365) * 86400_000).toISOString());
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "50");
      const r = await apiFetch<{ items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; htmlLink?: string }[] }>("Google Calendar", url.toString(), { token: ctx.token });
      return (r.items ?? []).map((e) => ({ id: e.id, titre: e.summary, debut: e.start?.dateTime ?? e.start?.date, fin: e.end?.dateTime ?? e.end?.date, lien: e.htmlLink }));
    },
    demo: () => demoWrap([{ id: "demo-ev1", titre: "Rendez-vous banque (exemple)", debut: new Date(Date.now() + 2 * 86400_000).toISOString() }]),
  },
  {
    name: "gcal_creer_evenement",
    description: "Crée un événement dans l'agenda Google (écriture : approbation). Les invités ne sont notifiés qu'en mode d'envoi réel.",
    inputSchema: obj({ titre: str("Titre"), debut: str("Début ISO 8601"), fin: str("Fin ISO 8601"), description: str("Description"), invites: { type: "array", items: { type: "string" } } }, ["titre", "debut", "fin"]),
    write: true,
    async run(a, ctx) {
      const invites = list(a.invites);
      const url = new URL(`${GCAL}/${encodeURIComponent(ctx.config.calendarId || "primary")}/events`);
      url.searchParams.set("sendUpdates", invites.length && ctx.config.__sendMode === "live" ? "all" : "none");
      const r = await apiFetch<{ id: string; htmlLink?: string }>("Google Calendar", url.toString(), {
        token: ctx.token,
        json: { summary: s(a.titre), description: s(a.description) || undefined, start: { dateTime: s(a.debut) }, end: { dateTime: s(a.fin) }, attendees: invites.map((email) => ({ email })) },
      });
      return { id: r.id, lien: r.htmlLink };
    },
    demo: (a) => demoWrap({ id: "demo-ev", titre: s(a.titre) }),
  },
];

/* ---------------------------------------------------- Microsoft Outlook (Graph) */

const GRAPH = "https://graph.microsoft.com/v1.0/me";
type GraphMsg = { id: string; conversationId?: string; subject?: string; from?: { emailAddress?: { name?: string; address?: string } }; receivedDateTime?: string; bodyPreview?: string; body?: { content?: string; contentType?: string }; internetMessageId?: string };
const recipients = (to: string[]) => to.map((address) => ({ emailAddress: { address } }));

export async function outlookList(ctx: NativeCtx, max: number): Promise<MailSummary[]> {
  const url = `${GRAPH}/mailFolders/inbox/messages?$top=${max}&$orderby=receivedDateTime%20desc&$select=id,conversationId,subject,from,receivedDateTime,bodyPreview,internetMessageId`;
  const r = await apiFetch<{ value?: GraphMsg[] }>("Microsoft Graph", url, { token: ctx.token });
  return (r.value ?? []).map((m) => ({ id: m.id, threadId: m.conversationId, from: m.from?.emailAddress?.name ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>` : m.from?.emailAddress?.address ?? "", subject: m.subject ?? "", date: m.receivedDateTime ?? "", snippet: m.bodyPreview ?? "", messageId: m.internetMessageId }));
}

const outlook: NativeTool[] = [
  {
    name: "outlook_lister_messages",
    description: "Liste les derniers emails de la boîte de réception Outlook / Microsoft 365.",
    inputSchema: obj({ max: { type: "number" } }),
    write: false,
    run: (a, ctx) => outlookList(ctx, n(a.max, 10, 25)),
    demo: () => demoWrap(DEMO_MAILS),
  },
  {
    name: "outlook_lire_message",
    description: "Lit un email Outlook par identifiant.",
    inputSchema: obj({ id: str("Identifiant") }, ["id"]),
    write: false,
    async run(a, ctx) {
      const m = await apiFetch<GraphMsg>("Microsoft Graph", `${GRAPH}/messages/${encodeURIComponent(s(a.id))}?$select=id,subject,from,receivedDateTime,body,conversationId`, { token: ctx.token, headers: { Prefer: 'outlook.body-content-type="text"' } });
      return { id: m.id, objet: m.subject, de: m.from?.emailAddress?.address, date: m.receivedDateTime, corps: (m.body?.content ?? "").slice(0, 8000) };
    },
    demo: (a) => demoWrap({ id: s(a.id), corps: "Bonjour (exemple)" }),
  },
  {
    name: "outlook_creer_brouillon",
    description: "Crée un brouillon dans Outlook (écriture : approbation).",
    inputSchema: obj({ a: { type: "array", items: { type: "string" } }, objet: str("Objet"), corps: str("Corps") }, ["a", "objet", "corps"]),
    write: true,
    async run(a, ctx) {
      const r = await apiFetch<{ id: string }>("Microsoft Graph", `${GRAPH}/messages`, { token: ctx.token, json: { subject: s(a.objet), body: { contentType: "Text", content: s(a.corps) }, toRecipients: recipients(list(a.a)) } });
      return { brouillon: r.id };
    },
    demo: (a) => demoWrap({ brouillon: "demo", objet: s(a.objet) }),
  },
  {
    name: "outlook_envoyer",
    description: "Envoie un email depuis Outlook (envoi à un tiers : approbation + mode réel).",
    inputSchema: obj({ a: { type: "array", items: { type: "string" } }, objet: str("Objet"), corps: str("Corps") }, ["a", "objet", "corps"]),
    write: true,
    sends: true,
    async run(a, ctx) {
      await apiFetch("Microsoft Graph", `${GRAPH}/sendMail`, { token: ctx.token, json: { message: { subject: s(a.objet), body: { contentType: "Text", content: s(a.corps) }, toRecipients: recipients(list(a.a)) }, saveToSentItems: true } });
      return { envoye: true };
    },
    demo: (a) => demoWrap({ envoye: false, objet: s(a.objet) }),
  },
  {
    name: "outlook_repondre",
    description: "Répond à un email Outlook (envoi à un tiers : approbation + mode réel).",
    inputSchema: obj({ id: str("Identifiant du message"), corps: str("Réponse") }, ["id", "corps"]),
    write: true,
    sends: true,
    async run(a, ctx) {
      await apiFetch("Microsoft Graph", `${GRAPH}/messages/${encodeURIComponent(s(a.id))}/reply`, { token: ctx.token, json: { comment: s(a.corps) } });
      return { envoye: true };
    },
    demo: () => demoWrap({ envoye: false }),
  },
  {
    name: "outlook_lister_evenements",
    description: "Liste les événements à venir du calendrier Outlook.",
    inputSchema: obj({ jours: { type: "number" } }),
    write: false,
    async run(a, ctx) {
      const start = new Date().toISOString();
      const end = new Date(Date.now() + n(a.jours, 14, 365) * 86400_000).toISOString();
      const r = await apiFetch<{ value?: { id: string; subject?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }[] }>("Microsoft Graph", `${GRAPH}/calendarView?startDateTime=${start}&endDateTime=${end}&$top=50`, { token: ctx.token });
      return (r.value ?? []).map((e) => ({ id: e.id, titre: e.subject, debut: e.start?.dateTime, fin: e.end?.dateTime }));
    },
    demo: () => demoWrap([{ id: "demo", titre: "Réunion partenaire (exemple)" }]),
  },
  {
    name: "outlook_creer_evenement",
    description: "Crée un événement dans le calendrier Outlook (écriture : approbation).",
    inputSchema: obj({ titre: str("Titre"), debut: str("Début ISO 8601"), fin: str("Fin ISO 8601"), fuseau: str("Fuseau IANA (défaut Africa/Douala)") }, ["titre", "debut", "fin"]),
    write: true,
    async run(a, ctx) {
      const tz = s(a.fuseau, "Africa/Douala");
      const r = await apiFetch<{ id: string; webLink?: string }>("Microsoft Graph", `${GRAPH}/events`, { token: ctx.token, json: { subject: s(a.titre), start: { dateTime: s(a.debut), timeZone: tz }, end: { dateTime: s(a.fin), timeZone: tz } } });
      return { id: r.id, lien: r.webLink };
    },
    demo: (a) => demoWrap({ id: "demo", titre: s(a.titre) }),
  },
];

/* --------------------------------------------------- WhatsApp Business Cloud API */

export const graphBase = () => `https://graph.facebook.com/${env("WHATSAPP_GRAPH_VERSION") || "v23.0"}`;
const waNumber = (v: unknown) => s(v).replace(/[^\d]/g, "");

const whatsapp: NativeTool[] = [
  {
    name: "whatsapp_envoyer_texte",
    description: "Envoie un message WhatsApp texte (dans la fenêtre de 24 h ouverte par le client). Envoi à un tiers : approbation + mode réel.",
    inputSchema: obj({ a: str("Numéro au format international, ex. 2376XXXXXXXX"), texte: str("Message") }, ["a", "texte"]),
    write: true,
    sends: true,
    async run(a, ctx) {
      const r = await apiFetch<{ messages?: { id: string }[] }>("WhatsApp", `${graphBase()}/${ctx.config.phoneNumberId}/messages`, {
        token: ctx.token,
        json: { messaging_product: "whatsapp", recipient_type: "individual", to: waNumber(a.a), type: "text", text: { preview_url: false, body: s(a.texte) } },
      });
      return { envoye: true, id: r.messages?.[0]?.id };
    },
    demo: (a) => demoWrap({ envoye: false, a: waNumber(a.a) }),
  },
  {
    name: "whatsapp_envoyer_modele",
    description: "Envoie un modèle WhatsApp approuvé par Meta (hors fenêtre de 24 h). Envoi à un tiers : approbation + mode réel.",
    inputSchema: obj({ a: str("Numéro international"), modele: str("Nom du modèle approuvé"), langue: str("Code langue (ex. fr)"), parametres: { type: "array", items: { type: "string" } } }, ["a", "modele"]),
    write: true,
    sends: true,
    async run(a, ctx) {
      const params = list(a.parametres);
      const r = await apiFetch<{ messages?: { id: string }[] }>("WhatsApp", `${graphBase()}/${ctx.config.phoneNumberId}/messages`, {
        token: ctx.token,
        json: {
          messaging_product: "whatsapp",
          to: waNumber(a.a),
          type: "template",
          template: { name: s(a.modele), language: { code: s(a.langue, "fr") }, ...(params.length ? { components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] } : {}) },
        },
      });
      return { envoye: true, id: r.messages?.[0]?.id };
    },
    demo: (a) => demoWrap({ envoye: false, modele: s(a.modele) }),
  },
  {
    name: "whatsapp_infos_numero",
    description: "Vérifie le numéro WhatsApp Business connecté (nom affiché, qualité).",
    inputSchema: obj({}),
    write: false,
    run: (_a, ctx) => apiFetch("WhatsApp", `${graphBase()}/${ctx.config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { token: ctx.token }),
    demo: () => demoWrap({ display_phone_number: "+237 6XX XX XX XX", verified_name: "Entreprise démo" }),
  },
];

/* ------------------------------------------------------------------ Slack */

async function slack<T>(method: string, token: string, payload?: Record<string, unknown>): Promise<T> {
  const r = payload
    ? await apiFetch<{ ok: boolean; error?: string } & T>("Slack", `https://slack.com/api/${method}`, { token, json: payload, headers: { "Content-Type": "application/json; charset=utf-8" } })
    : await apiFetch<{ ok: boolean; error?: string } & T>("Slack", `https://slack.com/api/${method}`, { token });
  if (!r.ok) throw new ConnectorHttpError(`Slack ${method} : ${r.error}`, 400);
  return r;
}

const slackTools: NativeTool[] = [
  {
    name: "slack_lister_canaux",
    description: "Liste les canaux Slack accessibles.",
    inputSchema: obj({}),
    write: false,
    async run(_a, ctx) {
      const r = await slack<{ channels: { id: string; name: string; is_private: boolean; num_members?: number }[] }>("conversations.list?limit=200&exclude_archived=true&types=public_channel,private_channel", ctx.token);
      return r.channels.map((c) => ({ id: c.id, nom: c.name, prive: c.is_private, membres: c.num_members }));
    },
    demo: () => demoWrap([{ id: "C000DEMO", nom: "general" }]),
  },
  {
    name: "slack_lire_canal",
    description: "Lit les derniers messages d'un canal Slack.",
    inputSchema: obj({ canal: str("Identifiant du canal (C…)"), max: { type: "number" } }, ["canal"]),
    write: false,
    async run(a, ctx) {
      const r = await slack<{ messages: { ts: string; user?: string; text: string }[] }>(`conversations.history?channel=${encodeURIComponent(s(a.canal))}&limit=${n(a.max, 20, 100)}`, ctx.token);
      return r.messages.map((m) => ({ ts: m.ts, auteur: m.user, texte: m.text }));
    },
    demo: () => demoWrap([{ ts: "1", texte: "Réunion à 10 h (exemple)" }]),
  },
  {
    name: "slack_publier_message",
    description: "Publie un message dans un canal Slack (approbation + mode réel).",
    inputSchema: obj({ canal: str("Identifiant du canal"), texte: str("Message") }, ["canal", "texte"]),
    write: true,
    sends: true,
    async run(a, ctx) {
      const r = await slack<{ ts: string; channel: string }>("chat.postMessage", ctx.token, { channel: s(a.canal), text: s(a.texte) });
      return { envoye: true, ts: r.ts, canal: r.channel };
    },
    demo: () => demoWrap({ envoye: false }),
  },
];

/* ------------------------------------------------------------------ Notion */

const NOTION = "https://api.notion.com/v1";
const notionHeaders = () => ({ "Notion-Version": env("NOTION_VERSION") || "2022-06-28" });
type NotionObj = { id: string; object: string; url?: string; properties?: Record<string, { type: string; title?: { plain_text: string }[] }> };
const notionTitle = (o: NotionObj) => Object.values(o.properties ?? {}).find((p) => p.type === "title")?.title?.map((t) => t.plain_text).join("") ?? "";

const notion: NativeTool[] = [
  {
    name: "notion_rechercher",
    description: "Recherche des pages et bases Notion partagées avec l'intégration.",
    inputSchema: obj({ requete: str("Texte recherché") }),
    write: false,
    async run(a, ctx) {
      const r = await apiFetch<{ results: NotionObj[] }>("Notion", `${NOTION}/search`, { token: ctx.token, headers: notionHeaders(), json: { query: s(a.requete), page_size: 20 } });
      return r.results.map((o) => ({ id: o.id, type: o.object, titre: notionTitle(o), url: o.url }));
    },
    demo: () => demoWrap([{ id: "demo-page", type: "page", titre: "Plan d'action (exemple)" }]),
  },
  {
    name: "notion_lire_page",
    description: "Lit le texte d'une page Notion (blocs de premier niveau).",
    inputSchema: obj({ page_id: str("Identifiant de page") }, ["page_id"]),
    write: false,
    async run(a, ctx) {
      const r = await apiFetch<{ results: { type: string; [k: string]: unknown }[] }>("Notion", `${NOTION}/blocks/${encodeURIComponent(s(a.page_id))}/children?page_size=100`, { token: ctx.token, headers: notionHeaders() });
      const text = r.results
        .map((b) => ((b[b.type] as { rich_text?: { plain_text: string }[] } | undefined)?.rich_text ?? []).map((t) => t.plain_text).join(""))
        .filter(Boolean)
        .join("\n");
      return { page_id: s(a.page_id), texte: text.slice(0, 8000) };
    },
    demo: () => demoWrap({ texte: "Contenu d'exemple" }),
  },
  {
    name: "notion_creer_page",
    description: "Crée une page Notion sous une page parente (écriture : approbation).",
    inputSchema: obj({ parent_id: str("Page parente"), titre: str("Titre"), contenu: str("Texte (paragraphes séparés par une ligne vide)") }, ["parent_id", "titre"]),
    write: true,
    async run(a, ctx) {
      const paragraphs = s(a.contenu).split(/\n{2,}/).filter(Boolean).slice(0, 90);
      const r = await apiFetch<{ id: string; url: string }>("Notion", `${NOTION}/pages`, {
        token: ctx.token,
        headers: notionHeaders(),
        json: {
          parent: { page_id: s(a.parent_id) },
          properties: { title: { title: [{ text: { content: s(a.titre) } }] } },
          children: paragraphs.map((p) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: p.slice(0, 1900) } }] } })),
        },
      });
      return { id: r.id, url: r.url };
    },
    demo: (a) => demoWrap({ id: "demo", titre: s(a.titre) }),
  },
];

/* ----------------------------------------------------------------- HubSpot */

const HUBSPOT = "https://api.hubapi.com/crm/v3/objects";
const hubspot: NativeTool[] = [
  {
    name: "hubspot_rechercher_contacts",
    description: "Recherche des contacts dans le CRM HubSpot.",
    inputSchema: obj({ requete: str("Nom, email, entreprise…") }),
    write: false,
    async run(a, ctx) {
      const r = await apiFetch<{ results: { id: string; properties: Record<string, string | null> }[] }>("HubSpot", `${HUBSPOT}/contacts/search`, {
        token: ctx.token,
        json: { query: s(a.requete), limit: 20, properties: ["email", "firstname", "lastname", "company", "phone"] },
      });
      return r.results.map((c) => ({ id: c.id, ...c.properties }));
    },
    demo: () => demoWrap([{ id: "demo-1", firstname: "Awa", lastname: "Exemple", email: "awa@exemple.example.com" }]),
  },
  {
    name: "hubspot_lister_transactions",
    description: "Liste les transactions (deals) du CRM HubSpot.",
    inputSchema: obj({ max: { type: "number" } }),
    write: false,
    async run(a, ctx) {
      const r = await apiFetch<{ results: { id: string; properties: Record<string, string | null> }[] }>("HubSpot", `${HUBSPOT}/deals?limit=${n(a.max, 20, 100)}&properties=dealname,amount,dealstage,closedate`, { token: ctx.token });
      return r.results.map((d) => ({ id: d.id, ...d.properties }));
    },
    demo: () => demoWrap([{ id: "demo-d1", dealname: "Contrat pilote (exemple)", amount: null }]),
  },
  {
    name: "hubspot_creer_contact",
    description: "Crée un contact dans HubSpot (écriture : approbation).",
    inputSchema: obj({ email: str("Email"), prenom: str("Prénom"), nom: str("Nom"), entreprise: str("Entreprise"), telephone: str("Téléphone") }, ["email"]),
    write: true,
    async run(a, ctx) {
      const r = await apiFetch<{ id: string }>("HubSpot", `${HUBSPOT}/contacts`, { token: ctx.token, json: { properties: { email: s(a.email), firstname: s(a.prenom) || undefined, lastname: s(a.nom) || undefined, company: s(a.entreprise) || undefined, phone: s(a.telephone) || undefined } } });
      return { id: r.id };
    },
    demo: (a) => demoWrap({ id: "demo", email: s(a.email) }),
  },
  {
    name: "hubspot_ajouter_note",
    description: "Ajoute une note à un contact HubSpot (écriture : approbation).",
    inputSchema: obj({ contact_id: str("Identifiant du contact"), note: str("Texte de la note") }, ["contact_id", "note"]),
    write: true,
    async run(a, ctx) {
      const r = await apiFetch<{ id: string }>("HubSpot", `${HUBSPOT}/notes`, {
        token: ctx.token,
        json: {
          properties: { hs_note_body: s(a.note), hs_timestamp: new Date().toISOString() },
          associations: [{ to: { id: s(a.contact_id) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
        },
      });
      return { id: r.id };
    },
    demo: () => demoWrap({ id: "demo" }),
  },
];

export const NATIVE_TOOLS: Record<NativeProvider, NativeTool[]> = {
  gmail,
  google_calendar: gcal,
  outlook,
  whatsapp,
  slack: slackTools,
  notion,
  hubspot,
};

/** Compte connecté (affichage) — appel léger, best effort. */
export async function fetchAccount(p: NativeProvider, ctx: NativeCtx): Promise<string | undefined> {
  try {
    if (p === "gmail") return (await apiFetch<{ emailAddress: string }>("Gmail", `${GMAIL}/profile`, { token: ctx.token })).emailAddress;
    if (p === "google_calendar") return (await apiFetch<{ summary?: string; id: string }>("Google Calendar", `${GCAL}/primary`, { token: ctx.token })).id;
    if (p === "outlook") {
      const me = await apiFetch<{ mail?: string; userPrincipalName?: string }>("Microsoft Graph", GRAPH, { token: ctx.token });
      return me.mail ?? me.userPrincipalName;
    }
    if (p === "slack") return (await slack<{ team: string; user: string }>("auth.test", ctx.token)).team;
    if (p === "notion") return (await apiFetch<{ name?: string; bot?: { workspace_name?: string } }>("Notion", `${NOTION}/users/me`, { token: ctx.token, headers: notionHeaders() })).bot?.workspace_name;
    if (p === "hubspot") return String((await apiFetch<{ portalId?: number }>("HubSpot", "https://api.hubapi.com/account-info/v3/details", { token: ctx.token })).portalId ?? "");
    if (p === "whatsapp" && ctx.config.phoneNumberId) return (await apiFetch<{ display_phone_number?: string }>("WhatsApp", `${graphBase()}/${ctx.config.phoneNumberId}?fields=display_phone_number`, { token: ctx.token })).display_phone_number;
  } catch {
    /* best effort */
  }
  return undefined;
}

/**
 * WhatsApp via OAuth Meta (Facebook Login for Business / Embedded Signup) : retrouve le compte WABA
 * et le premier numéro autorisé par l'utilisateur à partir du jeton (debug_token → granular_scopes).
 */
export async function discoverWhatsAppNumber(token: string): Promise<{ wabaId?: string; phoneNumberId?: string; display?: string }> {
  const appToken = `${env("META_APP_ID")}|${env("META_APP_SECRET")}`;
  const dbg = await apiFetch<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>("Meta", `${graphBase()}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`);
  const wabaId = dbg.data?.granular_scopes?.find((g) => g.scope === "whatsapp_business_management")?.target_ids?.[0];
  if (!wabaId) return {};
  const nums = await apiFetch<{ data?: { id: string; display_phone_number?: string }[] }>("WhatsApp", `${graphBase()}/${wabaId}/phone_numbers`, { token });
  return { wabaId, phoneNumberId: nums.data?.[0]?.id, display: nums.data?.[0]?.display_phone_number };
}
