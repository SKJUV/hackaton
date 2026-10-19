import { proposeExternalMessage } from "@/lib/workspace/actions";
import { log, WorkspaceError } from "@/lib/workspace/service";
import type { Company } from "@/lib/workspace/types";
import { createConnection, executeTool, invokeConnectorTool } from "./connectors";
import type { MailSummary } from "./native/providers";
import { mcpOf, newId, nowIso, pushCall, readMcp, withData } from "./repo";
import type { Connection, InboxCategory, InboxChannel, InboxMessage, RoutineKind } from "./types";

/**
 * Boîte de communication unifiée (emails Gmail/Outlook + WhatsApp) : classement, priorisation,
 * réponses suggérées et actions routinières — toujours via la file d'approbation.
 */

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const RULES: { cat: InboxCategory; weight: number; re: RegExp; label: string }[] = [
  { cat: "administration", weight: 40, re: /\b(impots?|dgi|cnps|mise en demeure|tribunal|huissier|convocation|controle fiscal|ministere|minpostel|art\b|agence de regulation|redressement|penalites?)\b/, label: "administration / autorité" },
  { cat: "paiement", weight: 30, re: /\b(facture|paiement|payer|impaye|virement|reglement|relance de paiement|echeance|solde du|acompte|avoir|invoice|payment)\b/, label: "paiement / facture" },
  { cat: "client", weight: 25, re: /\b(commande|livraison|reclamation|probleme|pas recu|rembourse|insatisfait|plainte|retour produit|service client|order)\b/, label: "client" },
  { cat: "candidature", weight: 10, re: /\b(candidature|cv|curriculum|stage|emploi|poste|recrutement|lettre de motivation|job)\b/, label: "candidature" },
  { cat: "partenariat", weight: 20, re: /\b(partenariat|partenaire|collaboration|proposition commerciale|distribution|accord|mou|protocole d.accord|partnership)\b/, label: "partenariat" },
  { cat: "fournisseur", weight: 15, re: /\b(devis|proforma|offre de prix|cotation|tarifs?|fournisseur|quotation)\b/, label: "fournisseur / devis" },
  { cat: "promotion", weight: -20, re: /\b(newsletter|se desabonner|desinscri|unsubscribe|promotion|promo|offre speciale|webinar)\b/, label: "promotion / newsletter" },
];
const URGENT = /\b(urgent|urgence|aujourd.hui|immediatement|sans delai|dernier rappel|delai de \d+|sous 48 ?h|avant le|asap|bloque)\b/;

export function classify(m: { subject?: string; body: string; channel: InboxChannel; receivedAt?: string }) {
  const text = norm(`${m.subject ?? ""} ${m.body}`);
  const reasons: string[] = [];
  let category: InboxCategory = "autre";
  let best = -Infinity;
  let score = 20;
  for (const r of RULES) {
    if (r.re.test(text)) {
      reasons.push(r.label);
      if (r.weight > best) {
        best = r.weight;
        category = r.cat;
      }
    }
  }
  if (best !== -Infinity) score += best;
  if (URGENT.test(text)) {
    score += 25;
    reasons.push("urgence exprimée");
  }
  if (m.channel === "whatsapp") {
    score += 5;
    reasons.push("WhatsApp (fenêtre de réponse de 24 h)");
  }
  if (m.receivedAt && Date.now() - new Date(m.receivedAt).getTime() < 24 * 3600_000) score += 5;
  if (category === "promotion") score = Math.min(score, 10);
  score = Math.max(0, Math.min(100, score));
  const priority: InboxMessage["priority"] = score >= 55 ? "haute" : score >= 30 ? "normale" : "basse";
  const routine: RoutineKind | undefined =
    category === "candidature" ? "refus_candidature" : category === "partenariat" ? "confirmation_partenariat" : category === "paiement" && /\b(nous vous devons|rappel de paiement|votre facture|reste a payer|impaye)\b/.test(text) ? "relance_paiement" : category === "promotion" ? undefined : "accuse_reception";
  return { category, priority, score, reasons, routine };
}

const firstName = (from: string, name?: string) => (name || from.replace(/<.*>/, "").trim() || "").split(/\s+/)[0] || "";

export const ROUTINE_LABELS: Record<RoutineKind, string> = {
  accuse_reception: "Accusé de réception",
  refus_candidature: "Refus de candidature",
  relance_paiement: "Relance de paiement",
  confirmation_partenariat: "Confirmation de partenariat",
};

export function routineReply(kind: RoutineKind, m: Pick<InboxMessage, "from" | "fromName" | "subject" | "channel">, company: Pick<Company, "name">) {
  const hello = `Bonjour${firstName(m.from, m.fromName) ? ` ${firstName(m.from, m.fromName)}` : ""},`;
  const sign = m.channel === "whatsapp" ? `— ${company.name}` : `Cordialement,\nL'équipe ${company.name}`;
  const body: Record<RoutineKind, string> = {
    accuse_reception: `${hello}\n\nNous avons bien reçu votre message${m.subject ? ` « ${m.subject} »` : ""} et nous revenons vers vous dans les meilleurs délais.\n\n${sign}`,
    refus_candidature: `${hello}\n\nMerci pour l'intérêt que vous portez à ${company.name} et pour votre candidature. Après examen, nous ne sommes pas en mesure d'y donner une suite favorable pour le moment. Nous conservons votre profil et vous souhaitons pleine réussite.\n\n${sign}`,
    relance_paiement: `${hello}\n\nSauf erreur de notre part, le règlement mentionné${m.subject ? ` (« ${m.subject} »)` : ""} reste en attente. Pourriez-vous nous indiquer la date de paiement prévue ? Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\n${sign}`,
    confirmation_partenariat: `${hello}\n\nMerci pour votre proposition. Nous confirmons notre intérêt pour ce partenariat et vous proposons d'en fixer les modalités lors d'un échange. Quelles sont vos disponibilités cette semaine ?\n\n${sign}`,
  };
  return body[kind];
}

/* ------------------------------------------------------------------ Données de démo */

const DEMO_MESSAGES: { channel: InboxChannel; from: string; fromName: string; subject?: string; body: string; hoursAgo: number }[] = [
  { channel: "email", from: "service.recouvrement@impots-demo.example.com", fromName: "Service des impôts (DÉMO)", subject: "Rappel : déclaration mensuelle à déposer", body: "Message d'EXEMPLE fictif. Nous vous rappelons que votre déclaration mensuelle doit être déposée avant le 15. Dernier rappel avant pénalités.", hoursAgo: 2 },
  { channel: "whatsapp", from: "237600000001", fromName: "Client démo — Mme Ngo", body: "Bonjour, je n'ai pas reçu ma commande de mardi, c'est urgent svp (message d'exemple)", hoursAgo: 1 },
  { channel: "email", from: "compta@client-demo.example.com", fromName: "Comptabilité client (démo)", subject: "Votre facture F-2026-014", body: "Exemple : nous avons bien reçu votre facture, le reste à payer sera réglé prochainement.", hoursAgo: 20 },
  { channel: "email", from: "partenariats@distrib-demo.example.com", fromName: "Distributeur démo", subject: "Proposition de partenariat de distribution", body: "Exemple : nous souhaitons distribuer vos produits à Yaoundé et Bafoussam. Seriez-vous ouverts à une collaboration ?", hoursAgo: 30 },
  { channel: "email", from: "candidat@demo.example.com", fromName: "Jean Candidat (démo)", subject: "Candidature spontanée — stage commercial", body: "Exemple : veuillez trouver ci-joint mon CV et ma lettre de motivation pour un stage.", hoursAgo: 50 },
  { channel: "email", from: "news@outil-demo.example.com", fromName: "Newsletter démo", subject: "Offre spéciale -30 %", body: "Exemple de promotion. Se désabonner.", hoursAgo: 70 },
];

async function ensureDemoInbox(companyId: string) {
  const { data, mcp } = await readMcp();
  const company = data.companies.find((c) => c.id === companyId);
  if (!company?.isExample || mcp.inbox.some((m) => m.companyId === companyId && m.isExample)) return;
  await withData((d) => {
    const m = mcpOf(d);
    if (m.inbox.some((x) => x.companyId === companyId && x.isExample)) return;
    for (const [i, x] of DEMO_MESSAGES.entries()) {
      const receivedAt = new Date(Date.now() - x.hoursAgo * 3600_000).toISOString();
      const c = classify({ ...x, receivedAt });
      m.inbox.push({
        id: newId("inb"),
        companyId,
        channel: x.channel,
        provider: "demo",
        externalId: `demo-${i}`,
        from: x.from,
        fromName: x.fromName,
        subject: x.subject,
        body: x.body,
        receivedAt,
        ...c,
        suggestedReply: c.routine ? routineReply(c.routine, { ...x, channel: x.channel }, company) : "",
        status: "nouveau",
        isExample: true,
        createdAt: nowIso(),
      });
    }
  });
}

export async function listInbox(companyId: string) {
  await ensureDemoInbox(companyId);
  const { data, mcp } = await readMcp();
  const approvals = new Map(data.approvals.map((a) => [a.id, a]));
  const order = { nouveau: 0, traite: 1, archive: 2 };
  const messages = mcp.inbox
    .filter((m) => m.companyId === companyId)
    .map((m) => {
      const appr = m.replyApprovalId ? approvals.get(m.replyApprovalId) : undefined;
      return { ...m, status: m.status === "nouveau" && appr?.status === "approuvee" ? ("traite" as const) : m.status, replyStatus: appr?.status };
    })
    .sort((a, b) => order[a.status] - order[b.status] || b.score - a.score || b.receivedAt.localeCompare(a.receivedAt));
  const sources = mcp.connections
    .filter((c) => c.companyId === companyId && ["gmail", "outlook", "whatsapp"].includes(c.provider ?? ""))
    .map((c) => ({ id: c.id, name: c.name, provider: c.provider, status: c.status, demo: c.demo, enabled: c.enabled }));
  return { messages, sources, stats: { nouveaux: messages.filter((m) => m.status === "nouveau").length, haute: messages.filter((m) => m.status === "nouveau" && m.priority === "haute").length } };
}

/* ------------------------------------------------------------------ Synchronisation */

const parseFrom = (raw: string) => {
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  return m ? { name: m[1].trim(), address: m[2].trim() } : { name: "", address: raw.trim() };
};

function upsert(companyId: string, company: Company, conn: Connection, items: MailSummary[], list: InboxMessage[]) {
  let added = 0;
  for (const it of items) {
    if (list.some((m) => m.companyId === companyId && m.connectionId === conn.id && m.externalId === it.id)) continue;
    const from = parseFrom(it.from);
    const receivedAt = it.date && !Number.isNaN(Date.parse(it.date)) ? new Date(it.date).toISOString() : nowIso();
    const c = classify({ subject: it.subject, body: it.snippet, channel: "email", receivedAt });
    list.push({
      id: newId("inb"),
      companyId,
      channel: "email",
      provider: conn.provider as "gmail" | "outlook",
      connectionId: conn.id,
      externalId: it.id,
      threadId: it.threadId ?? (it.messageId ? `msgid:${it.messageId}` : undefined),
      from: from.address,
      fromName: from.name || undefined,
      subject: it.subject,
      body: it.snippet,
      receivedAt,
      ...c,
      suggestedReply: c.routine ? routineReply(c.routine, { from: from.address, fromName: from.name, subject: it.subject, channel: "email" }, company) : "",
      status: "nouveau",
      isExample: false,
      createdAt: nowIso(),
    });
    added += 1;
  }
  return added;
}

/** Récupère les derniers emails des connecteurs Gmail/Outlook branchés (lecture : sans approbation). */
export async function syncInbox(companyId: string, actor: string) {
  const { data, mcp } = await readMcp();
  const company = data.companies.find((c) => c.id === companyId);
  if (!company) throw new WorkspaceError("Entreprise introuvable.", 404);
  const conns = mcp.connections.filter((c) => c.companyId === companyId && c.enabled && !c.demo && (c.provider === "gmail" || c.provider === "outlook") && c.status === "connecte");
  const report: { source: string; ajoutes: number; erreur?: string }[] = [];
  for (const conn of conns) {
    const tool = conn.provider === "gmail" ? "gmail_lister_messages" : "outlook_lister_messages";
    const started = Date.now();
    try {
      const r = await executeTool(conn, tool, conn.provider === "gmail" ? { requete: "in:inbox newer_than:14d", max: 20 } : { max: 20 });
      const items = (Array.isArray(r.result) ? r.result : []) as MailSummary[];
      const added = await withData((d) => {
        pushCall(d, { companyId, connectionId: conn.id, connectionName: conn.name, tool, args: { synchronisation: true }, write: false, status: r.status, durationMs: Date.now() - started, resultPreview: `${items.length} message(s)`, actor });
        return upsert(companyId, company, conn, items, mcpOf(d).inbox);
      });
      report.push({ source: conn.name, ajoutes: added });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await withData((d) => void pushCall(d, { companyId, connectionId: conn.id, connectionName: conn.name, tool, args: { synchronisation: true }, write: false, status: "erreur", error: message.slice(0, 300), actor }));
      report.push({ source: conn.name, ajoutes: 0, erreur: message.slice(0, 200) });
    }
  }
  await withData((d) => log(d, companyId, actor, "boite.synchronisation", conns.length ? report.map((r) => `${r.source} : ${r.erreur ? `erreur (${r.erreur})` : `+${r.ajoutes}`}`).join(" ; ") : "Aucun connecteur email réel branché (mode démo)."));
  return { sources: report, demo: conns.length === 0 };
}

/* ------------------------------------------------------------------ Webhook WhatsApp */

type WaWebhook = { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: { id: string; from: string; timestamp?: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } } }[] } }[] }[] };

export async function ingestWhatsAppWebhook(payload: WaWebhook) {
  let stored = 0;
  let ignored = 0;
  await withData((d) => {
    const m = mcpOf(d);
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value;
        const pid = v?.metadata?.phone_number_id;
        const targets = m.connections.filter((c) => c.provider === "whatsapp" && c.enabled && !c.demo && c.config.phoneNumberId && c.config.phoneNumberId === pid);
        for (const msg of v?.messages ?? []) {
          if (!targets.length) {
            ignored += 1;
            continue;
          }
          const body = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? `[message ${msg.type}]`;
          const name = v?.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name;
          const receivedAt = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : nowIso();
          for (const conn of targets) {
            if (m.inbox.some((x) => x.connectionId === conn.id && x.externalId === msg.id)) continue;
            const company = d.companies.find((c) => c.id === conn.companyId);
            if (!company) continue;
            const c = classify({ body, channel: "whatsapp", receivedAt });
            m.inbox.push({
              id: newId("inb"),
              companyId: conn.companyId,
              channel: "whatsapp",
              provider: "whatsapp",
              connectionId: conn.id,
              externalId: msg.id,
              threadId: msg.from,
              from: msg.from,
              fromName: name,
              body: body.slice(0, 4000),
              receivedAt,
              ...c,
              suggestedReply: c.routine ? routineReply(c.routine, { from: msg.from, fromName: name, channel: "whatsapp" }, company) : "",
              status: "nouveau",
              isExample: false,
              createdAt: nowIso(),
            });
            stored += 1;
          }
        }
      }
    }
  });
  return { stored, ignored };
}

/* ------------------------------------------------------------------ Réponses & routines */

export async function setInboxStatus(messageId: string, status: InboxMessage["status"]) {
  return withData((d) => {
    const msg = mcpOf(d).inbox.find((m) => m.id === messageId);
    if (!msg) throw new WorkspaceError("Message introuvable.", 404);
    msg.status = status;
    return { ok: true };
  });
}

export async function inboxMessageCompany(messageId: string): Promise<string | null> {
  const { mcp } = await readMcp();
  return mcp.inbox.find((m) => m.id === messageId)?.companyId ?? null;
}

/**
 * Prépare une réponse (texte libre ou action routinière) → TOUJOURS une approbation.
 * Canal réel si un connecteur est branché (Gmail/Outlook/WhatsApp), sinon pipeline email existant
 * (MAIL_MODE) ou connecteur WhatsApp de démonstration.
 */
export async function prepareReply(messageId: string, input: { corps?: string; routine?: RoutineKind }, actor: string) {
  const { data, mcp } = await readMcp();
  const msg = mcp.inbox.find((m) => m.id === messageId);
  if (!msg) throw new WorkspaceError("Message introuvable.", 404);
  const company = data.companies.find((c) => c.id === msg.companyId)!;
  const body = (input.corps?.trim() || (input.routine ? routineReply(input.routine, msg, company) : msg.suggestedReply)).slice(0, 8000);
  if (!body) throw new WorkspaceError("Réponse vide.");
  const title = `${input.routine ? ROUTINE_LABELS[input.routine] : "Réponse"} à ${msg.fromName ?? msg.from} (${msg.channel === "whatsapp" ? "WhatsApp" : "email"})`;
  const conn = msg.connectionId ? mcp.connections.find((c) => c.id === msg.connectionId && c.enabled) : undefined;
  const subject = msg.subject ? (/^re\s*:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`) : `Réponse de ${company.name}`;

  let approvalId: string;
  if (conn?.provider === "gmail") {
    const r = await invokeConnectorTool(msg.companyId, conn.id, "gmail_envoyer", { a: [msg.from], objet: subject, corps: body, thread_id: msg.threadId?.startsWith("msgid:") ? undefined : msg.threadId }, actor, { inboxMessageId: msg.id, title });
    approvalId = (r as { approvalId: string }).approvalId;
  } else if (conn?.provider === "outlook") {
    const r = await invokeConnectorTool(msg.companyId, conn.id, "outlook_repondre", { id: msg.externalId, corps: body }, actor, { inboxMessageId: msg.id, title });
    approvalId = (r as { approvalId: string }).approvalId;
  } else if (msg.channel === "whatsapp") {
    let wa = conn ?? mcp.connections.find((c) => c.companyId === msg.companyId && c.provider === "whatsapp" && c.enabled);
    if (!wa) {
      if (!msg.isExample) throw new WorkspaceError("Branchez le connecteur WhatsApp Business pour répondre.", 409);
      wa = await createConnection(msg.companyId, { catalogId: "whatsapp", demo: true, name: "WhatsApp Business (démo)" }, actor);
    }
    const r = await invokeConnectorTool(msg.companyId, wa.id, "whatsapp_envoyer_texte", { a: msg.from, texte: body }, actor, { inboxMessageId: msg.id, title });
    approvalId = (r as { approvalId: string }).approvalId;
  } else {
    const { approval } = await proposeExternalMessage(msg.companyId, { module: "connecteurs", type: "connecteurs_reponse", title, summary: `Réponse à ${msg.fromName ?? msg.from}`, channel: "email", to: [msg.from], subject, body }, actor);
    approvalId = approval.id;
  }
  await withData((d) => {
    const m = mcpOf(d).inbox.find((x) => x.id === messageId);
    if (m) m.replyApprovalId = approvalId;
    log(d, msg.companyId, actor, "boite.reponse", `${title} préparée → en attente d'approbation.`);
  });
  return { approvalId, title, corps: body };
}
