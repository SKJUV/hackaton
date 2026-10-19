import { computeCompliance } from "@/lib/compliance";
import { getMailConfig, sendMail } from "@/lib/mail";
import { buildChecklist, buildObligations } from "./seed";
import { newId, nowIso, readData, withData } from "./store";
import type {
  Approval,
  ApprovalType,
  Company,
  DocumentKind,
  Email,
  Role,
  StepStatus,
  Task,
  TaskStatus,
  WorkspaceData,
} from "./types";

export class WorkspaceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function requireCompany(data: WorkspaceData, companyId: string): Company {
  const company = data.companies.find((c) => c.id === companyId);
  if (!company) throw new WorkspaceError("Entreprise introuvable.", 404);
  return company;
}

export function log(data: WorkspaceData, companyId: string, actor: string, action: string, details: string) {
  data.activity.unshift({ id: newId("act"), companyId, actor, action, details, createdAt: nowIso() });
  if (data.activity.length > 2000) data.activity.length = 2000;
}

import { attachLegalCheck } from "./legal-check";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/* ---------------------------------------------------------------- Lecture */

/** Entreprises visibles : celles dont l'utilisateur est membre (par email) + les entreprises de démo. */
export function visibleCompanies(data: WorkspaceData, viewerEmail?: string | null) {
  if (viewerEmail === undefined) return data.companies;
  const email = viewerEmail?.toLowerCase();
  const mine = new Set(data.members.filter((m) => email && m.email.toLowerCase() === email).map((m) => m.companyId));
  return data.companies.filter((c) => c.isExample || mine.has(c.id));
}

export async function getSnapshot(companyId?: string, viewerEmail?: string | null) {
  const data = await readData();
  const companies = visibleCompanies(data, viewerEmail);
  const company = companies.find((c) => c.id === companyId) ?? companies.find((c) => !c.isExample) ?? companies[0];
  if (!company) throw new WorkspaceError("Aucune entreprise.", 404);
  const id = company.id;
  const by = <T extends { companyId: string }>(list: T[]) => list.filter((x) => x.companyId === id);
  const checklist = by(data.checklist).sort((a, b) => a.order - b.order);
  const obligations = by(data.obligations).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const documents = by(data.documents).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    companies,
    company,
    members: by(data.members),
    documents,
    tasks: by(data.tasks).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")),
    suppliers: data.suppliers,
    quotes: by(data.quotes).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    emails: by(data.emails).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    approvals: by(data.approvals).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    activity: by(data.activity).slice(0, 200),
    checklist,
    obligations,
    messages: by(data.messages).slice(-60),
    compliance: computeCompliance(checklist, obligations, documents),
    mail: getMailConfig(),
  };
}

export type Snapshot = Awaited<ReturnType<typeof getSnapshot>>;

/* ------------------------------------------------------- Entreprises/membres */

export async function createCompany(input: {
  name: string;
  sector: string;
  legalForm?: string;
  city?: string;
  description?: string;
  sectorKeywords?: string[];
  ownerName?: string;
  ownerEmail?: string;
  capital?: number;
}) {
  if (!input.name?.trim() || !input.sector?.trim()) throw new WorkspaceError("Nom et secteur requis.");
  return withData((data) => {
    const id = newId("co");
    const company: Company = {
      id,
      name: input.name.trim(),
      sector: input.sector.trim(),
      sectorKeywords: input.sectorKeywords?.length
        ? input.sectorKeywords
        : input.sector.toLowerCase().split(/[\s,;/]+/).filter((w) => w.length > 3),
      legalForm: input.legalForm || "SARL",
      city: input.city || "Douala",
      country: "Cameroun",
      stage: "idee",
      description: input.description || "",
      capital: input.capital,
      currency: "XAF",
      createdAt: nowIso(),
    };
    data.companies.push(company);
    data.members.push({ id: newId("mem"), companyId: id, name: input.ownerName || "Fondateur", email: input.ownerEmail || "fondateur@demo.example.com", role: "proprietaire", createdAt: nowIso() });
    data.checklist.push(...buildChecklist(id, 0));
    data.obligations.push(...buildObligations(id, true));
    log(data, id, "utilisateur", "entreprise.creation", `Workspace « ${company.name} » créé.`);
    return company;
  });
}

export async function addMember(companyId: string, input: { name: string; email: string; role: Role }) {
  if (!input.name?.trim() || !EMAIL_RE.test(input.email ?? "")) throw new WorkspaceError("Nom et email valides requis.");
  return withData((data) => {
    requireCompany(data, companyId);
    const member = { id: newId("mem"), companyId, name: input.name.trim(), email: input.email.trim(), role: input.role || "membre", createdAt: nowIso() };
    data.members.push(member);
    log(data, companyId, "utilisateur", "membre.ajout", `${member.name} ajouté(e) comme ${member.role}.`);
    return member;
  });
}

/* ---------------------------------------------------------------- Tâches */

export async function createTask(companyId: string, input: Partial<Task> & { title: string }, actor = "utilisateur") {
  if (!input.title?.trim()) throw new WorkspaceError("Titre requis.");
  return withData((data) => {
    requireCompany(data, companyId);
    const task: Task = {
      id: newId("tsk"),
      companyId,
      title: input.title.trim(),
      description: input.description,
      dueDate: input.dueDate,
      status: input.status ?? "a_faire",
      source: input.source ?? (actor === "agent" ? "agent" : "utilisateur"),
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      createdAt: nowIso(),
    };
    data.tasks.push(task);
    log(data, companyId, actor, "tache.creation", `Tâche « ${task.title} »${task.dueDate ? ` (échéance ${task.dueDate.slice(0, 10)})` : ""}.`);
    return task;
  });
}

export async function updateTaskStatus(taskId: string, status: TaskStatus, actor = "utilisateur") {
  return withData((data) => {
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) throw new WorkspaceError("Tâche introuvable.", 404);
    task.status = status;
    log(data, task.companyId, actor, "tache.statut", `« ${task.title} » → ${status}.`);
    return task;
  });
}

/* ------------------------------------------------------ Emails & approbation */

const PHONE_RE = /^\+?[0-9 ()X.-]{6,20}$/i;

/** Crée l'action externe (email ou autre canal) et sa demande d'approbation. À appeler dans withData(). */
export function createEmailWithApproval(
  data: WorkspaceData,
  companyId: string,
  input: { to: string[]; cc?: string[]; subject: string; body: string; relatedType?: Email["relatedType"]; relatedId?: string; channel?: Email["channel"] },
  approval: { type: ApprovalType; title: string; summary: string; quoteId?: string; module?: string },
  actor: string,
) {
  const channel = input.channel ?? "email";
  const recipients = input.to.map((t) => t.trim()).filter(Boolean);
  const valid = channel === "email" ? EMAIL_RE : PHONE_RE;
  if (!recipients.length || !recipients.every((r) => valid.test(r))) throw new WorkspaceError(channel === "email" ? "Destinataire(s) email invalide(s)." : "Numéro(s) de destinataire invalide(s).");
  if (!input.subject?.trim() || !input.body?.trim()) throw new WorkspaceError("Objet et corps de l'email requis.");
  const email: Email = {
    id: newId("eml"),
    companyId,
    to: recipients,
    cc: input.cc?.filter(Boolean),
    subject: input.subject.trim(),
    body: input.body.trim(),
    status: "en_attente_approbation",
    channel: channel === "email" ? undefined : channel,
    relatedType: input.relatedType ?? "libre",
    relatedId: input.relatedId,
    createdBy: actor,
    createdAt: nowIso(),
  };
  data.emails.push(email);
  const appr: Approval = {
    id: newId("apr"),
    companyId,
    type: approval.type,
    title: approval.title,
    summary: approval.summary,
    emailId: email.id,
    quoteId: approval.quoteId,
    module: approval.module,
    status: "en_attente" as const,
    requestedBy: actor,
    createdAt: nowIso(),
  };
  data.approvals.push(appr);
  log(data, companyId, actor, "approbation.demande", `${approval.title} — en attente de validation humaine.`);
  return { email, approval: appr };
}

export async function draftEmail(
  companyId: string,
  input: { to: string[]; cc?: string[]; subject: string; body: string },
  actor = "agent",
) {
  const res = await withData((data) => {
    requireCompany(data, companyId);
    return createEmailWithApproval(
      data,
      companyId,
      { ...input, relatedType: "libre" },
      { type: "envoi_email", title: `Envoyer l'email « ${input.subject} »`, summary: `À : ${input.to.join(", ")}` },
      actor,
    );
  });
  res.approval.legalCheck = (await attachLegalCheck([res.approval.id], `${input.subject} ${input.body}`)) ?? undefined;
  return res;
}

/** Valide ou rejette une action externe. L'envoi n'a lieu qu'ici. */
export async function decideApproval(approvalId: string, decision: "approuver" | "rejeter", decidedBy: string, note?: string) {
  // Phase 1 : verrouiller la décision.
  const pending = await withData((data) => {
    const approval = data.approvals.find((a) => a.id === approvalId);
    if (!approval) throw new WorkspaceError("Approbation introuvable.", 404);
    if (approval.status !== "en_attente") throw new WorkspaceError("Cette demande a déjà été traitée.", 409);
    const email = data.emails.find((e) => e.id === approval.emailId);
    if (!email) throw new WorkspaceError("Email associé introuvable.", 404);
    approval.status = decision === "approuver" ? "approuvee" : "rejetee";
    approval.decidedBy = decidedBy;
    approval.decidedAt = nowIso();
    approval.decisionNote = note;
    if (decision === "rejeter") {
      email.status = "rejete";
      const quote = approval.quoteId ? data.quotes.find((q) => q.id === approval.quoteId) : undefined;
      if (quote && quote.status === "en_attente_approbation") quote.status = "annulee";
      log(data, approval.companyId, decidedBy, "approbation.rejet", `${approval.title} rejeté${note ? ` : ${note}` : ""}.`);
      return null;
    }
    log(data, approval.companyId, decidedBy, "approbation.validation", `${approval.title} validé.`);
    return { approval: { ...approval }, email: { ...email } };
  });
  if (!pending) return { status: "rejetee" as const };

  // Phase 2 : envoi (hors verrou, réseau possible en mode live).
  const result =
    pending.email.channel && pending.email.channel !== "email"
      ? { ok: true, simulated: true, provider: `simulation-${pending.email.channel}`, messageId: undefined as string | undefined, error: undefined as string | undefined }
      : await sendMail({ to: pending.email.to, cc: pending.email.cc, subject: pending.email.subject, text: pending.email.body });

  return withData((data) => {
    const email = data.emails.find((e) => e.id === pending.email.id)!;
    email.provider = result.provider;
    if (result.ok) {
      email.status = result.simulated ? "simule" : "envoye";
      email.sentAt = nowIso();
      email.providerMessageId = result.messageId;
      const quote = pending.approval.quoteId ? data.quotes.find((q) => q.id === pending.approval.quoteId) : undefined;
      if (quote) {
        if (quote.status === "en_attente_approbation") quote.status = "envoyee";
        quote.lastContactAt = nowIso();
      }
      log(data, email.companyId, "agent", result.simulated ? "email.simule" : "email.envoye", `${result.simulated ? "[SIMULATION] " : ""}Email « ${email.subject} » → ${email.to.join(", ")}.`);
      return { status: "approuvee" as const, emailStatus: email.status };
    }
    email.status = "echec";
    email.error = result.error;
    log(data, email.companyId, "system", "email.echec", `Échec d'envoi « ${email.subject} » : ${result.error}`);
    return { status: "approuvee" as const, emailStatus: email.status, error: result.error };
  });
}

/* ------------------------------------------------------------ Fournisseurs */

export async function searchSuppliers(query: { category?: string; city?: string; need?: string }) {
  const data = await readData();
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const generic = new Set(["devis", "fournisseur", "fournisseurs", "demande", "demander", "trouve", "trouver", "pour", "avec", "dans", "contacte", "contacter", "prestataire", "prestataires", "besoin", "acheter", "commander", "veux", "voudrais", "merci", "peux", "cherche"]);
  const need = query.need
    ? norm(query.need)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3 && !generic.has(w))
        .map((w) => (w.length > 4 ? w.replace(/s$/, "") : w))
    : [];
  return data.suppliers
    .map((s) => {
      const words = new Set(
        norm(`${s.name} ${s.category} ${s.services.join(" ")} ${s.description}`)
          .split(/[^a-z0-9]+/)
          .map((w) => (w.length > 4 ? w.replace(/s$/, "") : w)),
      );
      let score = s.rating;
      if (query.category && norm(s.category).includes(norm(query.category))) score += 10;
      if (query.city && norm(s.city) === norm(query.city)) score += 3;
      score += need.filter((w) => words.has(w)).length * 4;
      return { supplier: s, score };
    })
    .filter(({ score, supplier }) =>
      query.category
        ? norm(supplier.category).includes(norm(query.category)) || score >= supplier.rating + 4
        : need.length
          ? score >= supplier.rating + 4
          : true,
    )
    .sort((a, b) => b.score - a.score)
    .filter((entry, _i, all) => !need.length || entry.score >= all[0].score * 0.7)
    .map(({ supplier }) => supplier);
}

export async function requestQuotes(
  companyId: string,
  input: { supplierIds: string[]; need: string; quantity?: string; desiredDate?: string; senderName?: string },
  actor = "agent",
) {
  if (!input.supplierIds?.length) throw new WorkspaceError("Choisissez au moins un fournisseur.");
  if (!input.need?.trim()) throw new WorkspaceError("Décrivez le besoin.");
  const created = await withData((data) => {
    const company = requireCompany(data, companyId);
    const owner = data.members.find((m) => m.companyId === companyId && m.role === "proprietaire");
    const created = [];
    for (const supplierId of input.supplierIds) {
      const supplier = data.suppliers.find((s) => s.id === supplierId);
      if (!supplier) throw new WorkspaceError(`Fournisseur ${supplierId} introuvable.`, 404);
      const quoteId = newId("dev");
      const body = `Bonjour ${supplier.name.replace(" (exemple)", "")},\n\nJe suis ${input.senderName || owner?.name || "le fondateur"} de ${company.name.replace(" (démo)", "")} (${company.sector}, ${company.city}).\n\nNous souhaiterions recevoir un devis pour :\n- Besoin : ${input.need}\n${input.quantity ? `- Quantité : ${input.quantity}\n` : ""}${input.desiredDate ? `- Date souhaitée : ${input.desiredDate}\n` : ""}\nMerci de préciser le prix TTC, le délai de livraison/exécution et la durée de validité de l'offre.\n\nRéférence : ${quoteId}\n\nCordialement,\n${input.senderName || owner?.name || "Le fondateur"}\n${company.name.replace(" (démo)", "")}`;
      const { email, approval } = createEmailWithApproval(
        data,
        companyId,
        { to: [supplier.email], subject: `Demande de devis — ${input.need.slice(0, 60)} (réf. ${quoteId})`, body, relatedType: "devis", relatedId: quoteId },
        { type: "demande_devis", title: `Demande de devis à ${supplier.name}`, summary: input.need, quoteId },
        actor,
      );
      const quote = {
        id: quoteId,
        companyId,
        supplierId,
        need: input.need,
        quantity: input.quantity,
        desiredDate: input.desiredDate,
        status: "en_attente_approbation" as const,
        emailId: email.id,
        followUpCount: 0,
        createdAt: nowIso(),
      };
      data.quotes.push(quote);
      created.push({ quote, approvalId: approval.id, supplier: supplier.name });
    }
    log(data, companyId, actor, "devis.demande", `${created.length} demande(s) de devis préparée(s) : ${input.need}.`);
    return created;
  });
  await attachLegalCheck(created.map((c) => c.approvalId), `contrat fourniture vente ${input.need} obligations vendeur`);
  return created;
}

/** SEED : simule la réponse d'un fournisseur pour visualiser le suivi et la comparaison. */
export async function simulateQuoteResponse(quoteId: string) {
  return withData((data) => {
    const quote = data.quotes.find((q) => q.id === quoteId);
    if (!quote) throw new WorkspaceError("Devis introuvable.", 404);
    if (quote.status !== "envoyee") throw new WorkspaceError("La demande doit d'abord être envoyée (approuvée).", 409);
    const supplier = data.suppliers.find((s) => s.id === quote.supplierId)!;
    const seed = [...quote.id].reduce((s, c) => s + c.charCodeAt(0), 0);
    const amount = Math.round((150000 + (seed % 20) * 37500) / 500) * 500;
    quote.status = "reponse_recue";
    quote.response = {
      amount,
      currency: "XAF",
      delayDays: 3 + (seed % 12),
      note: `[RÉPONSE SIMULÉE] Offre de ${supplier.name}, valable 30 jours.`,
      receivedAt: nowIso(),
      simulated: true,
    };
    log(data, quote.companyId, "system", "devis.reponse_simulee", `Réponse simulée de ${supplier.name} : ${amount.toLocaleString("fr-FR")} XAF.`);
    return quote;
  });
}

export async function followUpQuote(quoteId: string, actor = "agent") {
  const res = await withData((data) => {
    const quote = data.quotes.find((q) => q.id === quoteId);
    if (!quote) throw new WorkspaceError("Devis introuvable.", 404);
    if (quote.status !== "envoyee") throw new WorkspaceError("Seules les demandes envoyées sans réponse peuvent être relancées.", 409);
    const supplier = data.suppliers.find((s) => s.id === quote.supplierId)!;
    const company = requireCompany(data, quote.companyId);
    quote.followUpCount += 1;
    const res = createEmailWithApproval(
      data,
      quote.companyId,
      {
        to: [supplier.email],
        subject: `Relance — demande de devis réf. ${quote.id}`,
        body: `Bonjour,\n\nJe me permets de revenir vers vous concernant notre demande de devis (réf. ${quote.id}) pour : ${quote.need}.\nPourriez-vous nous indiquer quand nous pourrions recevoir votre offre ?\n\nCordialement,\n${company.name.replace(" (démo)", "")}`,
        relatedType: "relance",
        relatedId: quote.id,
      },
      { type: "relance_fournisseur", title: `Relance n°${quote.followUpCount} à ${supplier.name}`, summary: quote.need, quoteId: quote.id },
      actor,
    );
    return { quote, approvalId: res.approval.id };
  });
  await attachLegalCheck([res.approvalId], `relance contrat fourniture ${res.quote.need}`);
  return res;
}

export async function decideQuote(quoteId: string, decision: "acceptee" | "refusee", actor = "utilisateur") {
  return withData((data) => {
    const quote = data.quotes.find((q) => q.id === quoteId);
    if (!quote) throw new WorkspaceError("Devis introuvable.", 404);
    if (quote.status !== "reponse_recue") throw new WorkspaceError("Le devis doit avoir reçu une réponse.", 409);
    quote.status = decision;
    log(data, quote.companyId, actor, `devis.${decision}`, `Devis ${quote.id} ${decision}.`);
    return quote;
  });
}

/* ------------------------------------------------- Documents & démarches */

export async function saveDocument(
  companyId: string,
  input: { title: string; kind: DocumentKind; content: string; needsReview?: boolean },
  actor = "utilisateur",
) {
  if (!input.title?.trim() || !input.content?.trim()) throw new WorkspaceError("Titre et contenu requis.");
  return withData((data) => {
    requireCompany(data, companyId);
    const doc = { id: newId("doc"), companyId, title: input.title.trim(), kind: input.kind, content: input.content, createdBy: actor, createdAt: nowIso(), updatedAt: nowIso(), needsReview: input.needsReview };
    data.documents.push(doc);
    log(data, companyId, actor, "document.creation", `Document « ${doc.title} » enregistré.`);
    return doc;
  });
}

export async function updateChecklistStep(stepId: string, status: StepStatus, note?: string, actor = "utilisateur") {
  return withData((data) => {
    const step = data.checklist.find((s) => s.id === stepId || s.title.toLowerCase() === stepId.toLowerCase());
    if (!step) throw new WorkspaceError("Démarche introuvable.", 404);
    step.status = status;
    if (note !== undefined) step.note = note;
    step.updatedAt = nowIso();
    log(data, step.companyId, actor, "demarche.statut", `« ${step.title} » → ${status}${note ? ` (${note})` : ""}.`);
    return step;
  });
}

export async function toggleObligation(obligationId: string, done: boolean, actor = "utilisateur") {
  return withData((data) => {
    const o = data.obligations.find((x) => x.id === obligationId);
    if (!o) throw new WorkspaceError("Obligation introuvable.", 404);
    o.done = done;
    log(data, o.companyId, actor, "obligation.statut", `« ${o.title} » ${done ? "faite" : "à faire"}.`);
    return o;
  });
}

/** Transforme les échéances proches en tâches de rappel (idempotent). */
export async function syncObligationReminders(companyId: string, horizonDays = 30) {
  return withData((data) => {
    const now = Date.now();
    const created: Task[] = [];
    for (const o of data.obligations.filter((x) => x.companyId === companyId && !x.done)) {
      const due = new Date(o.dueDate).getTime();
      if (due - now > horizonDays * 86400000) continue;
      if (data.tasks.some((t) => t.relatedType === "obligation" && t.relatedId === o.id && t.status !== "fait")) continue;
      const task: Task = { id: newId("tsk"), companyId, title: `Préparer : ${o.title}`, dueDate: o.dueDate, status: "a_faire", source: "calendrier", relatedType: "obligation", relatedId: o.id, createdAt: nowIso() };
      data.tasks.push(task);
      created.push(task);
    }
    if (created.length) log(data, companyId, "agent", "rappels.calendrier", `${created.length} rappel(s) créé(s) depuis le calendrier.`);
    return created;
  });
}
