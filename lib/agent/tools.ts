import {
  generateBusinessPlan,
  generateLegalDocument,
  generateRoadmap,
  LEGAL_TEMPLATE_LABELS,
  type LegalTemplateKind,
} from "@/lib/cofounder/generators";
import { regulatoryWatch } from "@/lib/compliance";
import type { Citation } from "@/lib/legal/citations";
import { listOfficialDocuments, searchLegalCorpus } from "@/lib/legal/corpus";
import {
  createTask,
  draftEmail,
  followUpQuote,
  getSnapshot,
  requestQuotes,
  saveDocument,
  searchSuppliers,
  syncObligationReminders,
  updateChecklistStep,
} from "@/lib/workspace/service";
import type { StepStatus } from "@/lib/workspace/types";

export type ToolContext = { companyId: string; citations: Citation[] };
export type ToolResult = { summary: string; data: unknown };
type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[] };
export type AgentTool = {
  name: string;
  description: string;
  parameters: JsonSchema;
  /** true si l'outil prépare une action externe soumise à approbation. */
  external?: boolean;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? v.split(/[,;\s]+/).filter(Boolean) : []);

async function company(ctx: ToolContext) {
  return getSnapshot(ctx.companyId);
}

export const TOOLS: AgentTool[] = [
  {
    name: "rechercher_textes_juridiques",
    description:
      "Recherche dans le corpus juridique officiel fourni par l'État (lois, décrets, arrêtés, décisions) et renvoie des extraits numérotés [S1], [S2]… avec document, page et articles. Toujours l'utiliser avant toute affirmation juridique. Les extraits marqués isExample=true sont des textes d'exemple NON officiels.",
    parameters: { type: "object", properties: { question: { type: "string", description: "Question juridique reformulée avec les mots-clés utiles" } }, required: ["question"] },
    async run(input, ctx) {
      const result = await searchLegalCorpus(str(input.question), 5);
      const offset = ctx.citations.length;
      const renumbered = result.citations.map((c, i) => ({ ...c, id: `S${offset + i + 1}` }));
      ctx.citations.push(...renumbered);
      return {
        summary: `${result.officialCount} extrait(s) officiel(s)${result.exampleCount ? ` + ${result.exampleCount} exemple(s) non officiel(s)` : ""}${result.indexReady ? "" : " — index PDF absent (npm run index-documents)"}`,
        data: renumbered.map((c) => ({ id: c.id, document: c.legalTitle ?? c.title, categorie: c.category, page: c.page, articles: c.articles, isExample: c.isExample, extrait: c.excerpt.slice(0, 1200) })),
      };
    },
  },
  {
    name: "rediger_email",
    description:
      "Rédige un email au nom de l'entreprise et le place dans la file d'approbation. L'email n'est envoyé qu'après validation humaine dans l'onglet Approbations.",
    external: true,
    parameters: {
      type: "object",
      properties: {
        destinataires: { type: "array", items: { type: "string" }, description: "Adresses email" },
        objet: { type: "string" },
        corps: { type: "string", description: "Corps complet de l'email, signé" },
      },
      required: ["destinataires", "objet", "corps"],
    },
    async run(input, ctx) {
      const { email, approval } = await draftEmail(ctx.companyId, { to: strArr(input.destinataires), subject: str(input.objet), body: str(input.corps) });
      return { summary: `Email « ${email.subject} » préparé → en attente d'approbation`, data: { emailId: email.id, approvalId: approval.id, statut: email.status } };
    },
  },
  {
    name: "lister_fournisseurs",
    description: "Cherche dans l'annuaire fournisseurs (catégorie, ville, besoin). Renvoie id, nom, services, note.",
    parameters: {
      type: "object",
      properties: { besoin: { type: "string" }, categorie: { type: "string" }, ville: { type: "string" } },
    },
    async run(input) {
      const list = await searchSuppliers({ need: str(input.besoin), category: str(input.categorie) || undefined, city: str(input.ville) || undefined });
      return {
        summary: `${list.length} fournisseur(s) trouvé(s)`,
        data: list.slice(0, 8).map((s) => ({ id: s.id, nom: s.name, categorie: s.category, services: s.services, ville: s.city, note: s.rating, exemple: s.isExample })),
      };
    },
  },
  {
    name: "demander_devis",
    description:
      "Prépare une demande de devis (email) pour un ou plusieurs fournisseurs de l'annuaire. Chaque email passe par la file d'approbation, puis le devis est suivi (envoyé, réponse, relance).",
    external: true,
    parameters: {
      type: "object",
      properties: {
        fournisseur_ids: { type: "array", items: { type: "string" } },
        besoin: { type: "string" },
        quantite: { type: "string" },
        date_souhaitee: { type: "string" },
      },
      required: ["fournisseur_ids", "besoin"],
    },
    async run(input, ctx) {
      const created = await requestQuotes(ctx.companyId, { supplierIds: strArr(input.fournisseur_ids), need: str(input.besoin), quantity: str(input.quantite) || undefined, desiredDate: str(input.date_souhaitee) || undefined });
      return { summary: `${created.length} demande(s) de devis en attente d'approbation`, data: created.map((c) => ({ devis: c.quote.id, fournisseur: c.supplier, approbation: c.approvalId })) };
    },
  },
  {
    name: "suivre_devis",
    description: "Liste les demandes de devis et leur statut, compare les réponses reçues (prix, délai) et indique celles à relancer.",
    parameters: { type: "object", properties: {} },
    async run(_input, ctx) {
      const snap = await company(ctx);
      const rows = snap.quotes.map((q) => ({ id: q.id, fournisseur: snap.suppliers.find((s) => s.id === q.supplierId)?.name, besoin: q.need, statut: q.status, relances: q.followUpCount, reponse: q.response }));
      const answered = rows.filter((r) => r.reponse).sort((a, b) => a.reponse!.amount - b.reponse!.amount);
      return { summary: `${rows.length} devis suivis, ${answered.length} réponse(s)`, data: { devis: rows, meilleur_prix: answered[0] ?? null, a_relancer: rows.filter((r) => r.statut === "envoyee").map((r) => r.id) } };
    },
  },
  {
    name: "relancer_fournisseur",
    description: "Prépare un email de relance pour une demande de devis envoyée sans réponse (soumis à approbation).",
    external: true,
    parameters: { type: "object", properties: { devis_id: { type: "string" } }, required: ["devis_id"] },
    async run(input) {
      const res = await followUpQuote(str(input.devis_id));
      return { summary: `Relance n°${res.quote.followUpCount} préparée → en attente d'approbation`, data: res };
    },
  },
  {
    name: "creer_tache",
    description: "Crée une tâche ou un rappel dans le workspace (avec échéance optionnelle au format AAAA-MM-JJ).",
    parameters: { type: "object", properties: { titre: { type: "string" }, description: { type: "string" }, echeance: { type: "string" } }, required: ["titre"] },
    async run(input, ctx) {
      const due = str(input.echeance);
      const task = await createTask(ctx.companyId, { title: str(input.titre), description: str(input.description) || undefined, dueDate: /^\d{4}-\d{2}-\d{2}/.test(due) ? new Date(due).toISOString() : undefined }, "agent");
      return { summary: `Tâche « ${task.title} » créée`, data: task };
    },
  },
  {
    name: "lister_taches",
    description: "Liste les tâches ouvertes et terminées.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const snap = await company(ctx);
      return { summary: `${snap.tasks.filter((t) => t.status !== "fait").length} tâche(s) ouverte(s)`, data: snap.tasks.map((t) => ({ id: t.id, titre: t.title, statut: t.status, echeance: t.dueDate?.slice(0, 10) })) };
    },
  },
  {
    name: "generer_business_plan",
    description: "Génère et enregistre le business plan de l'entreprise. Fournir `contenu_markdown` pour enregistrer un plan rédigé par toi ; sinon un modèle structuré est créé depuis le profil.",
    parameters: { type: "object", properties: { contenu_markdown: { type: "string" }, notes: { type: "string" } } },
    async run(input, ctx) {
      const snap = await company(ctx);
      const content = str(input.contenu_markdown) || generateBusinessPlan(snap.company, str(input.notes));
      const doc = await saveDocument(ctx.companyId, { title: `Business plan — ${snap.company.name}`, kind: "business_plan", content }, "agent");
      return { summary: `Business plan enregistré dans Documents`, data: { documentId: doc.id, apercu: content.slice(0, 600) } };
    },
  },
  {
    name: "generer_roadmap",
    description: "Génère et enregistre une roadmap (feuille de route) sur N mois.",
    parameters: { type: "object", properties: { horizon_mois: { type: "number" }, contenu_markdown: { type: "string" } } },
    async run(input, ctx) {
      const snap = await company(ctx);
      const months = typeof input.horizon_mois === "number" ? Math.min(Math.max(input.horizon_mois, 2), 24) : 6;
      const content = str(input.contenu_markdown) || generateRoadmap(snap.company, months);
      const doc = await saveDocument(ctx.companyId, { title: `Roadmap ${months} mois`, kind: "roadmap", content }, "agent");
      return { summary: `Roadmap ${months} mois enregistrée`, data: { documentId: doc.id, apercu: content.slice(0, 600) } };
    },
  },
  {
    name: "checklist_creation_entreprise",
    description: "Renvoie la checklist de création d'entreprise et l'état d'avancement de chaque démarche.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const snap = await company(ctx);
      const done = snap.checklist.filter((s) => s.status === "fait").length;
      return { summary: `Démarches : ${done}/${snap.checklist.length} terminées`, data: snap.checklist.map((s) => ({ id: s.id, ordre: s.order, titre: s.title, statut: s.status, autorite: s.authority, pieces: s.documents, exemple: s.isExample })) };
    },
  },
  {
    name: "mettre_a_jour_demarche",
    description: "Met à jour le statut d'une démarche de création (a_faire, en_cours, fait, bloque).",
    parameters: { type: "object", properties: { demarche_id: { type: "string" }, statut: { type: "string", enum: ["a_faire", "en_cours", "fait", "bloque"] }, note: { type: "string" } }, required: ["demarche_id", "statut"] },
    async run(input) {
      const step = await updateChecklistStep(str(input.demarche_id), str(input.statut) as StepStatus, str(input.note) || undefined, "agent");
      return { summary: `Démarche « ${step.title} » → ${step.status}`, data: step };
    },
  },
  {
    name: "generer_document_juridique",
    description: `Génère une trame de document juridique pré-remplie et l'enregistre (à faire valider par un professionnel). Types : ${Object.keys(LEGAL_TEMPLATE_LABELS).join(", ")}.`,
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: Object.keys(LEGAL_TEMPLATE_LABELS) },
        partie: { type: "string", description: "Cocontractant / salarié" },
        objet: { type: "string" },
        prix: { type: "string" },
        delai: { type: "string" },
        poste: { type: "string" },
        salaire: { type: "string" },
      },
      required: ["type"],
    },
    async run(input, ctx) {
      const kind = (str(input.type) in LEGAL_TEMPLATE_LABELS ? str(input.type) : "contrat_prestation") as LegalTemplateKind;
      const snap = await company(ctx);
      const details = Object.fromEntries(Object.entries(input).filter(([, v]) => typeof v === "string")) as Record<string, string>;
      const content = generateLegalDocument(kind, snap.company, snap.members, details);
      const doc = await saveDocument(ctx.companyId, { title: `${LEGAL_TEMPLATE_LABELS[kind]}${details.partie ? ` — ${details.partie}` : ""}`, kind: kind === "statuts" ? "statuts" : kind === "pv_ag" ? "pv" : "contrat", content, needsReview: true }, "agent");
      return { summary: `${LEGAL_TEMPLATE_LABELS[kind]} générée (à valider)`, data: { documentId: doc.id } };
    },
  },
  {
    name: "score_conformite",
    description: "Calcule le score de conformité (0–100) de l'entreprise avec détail et recommandations.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const snap = await company(ctx);
      return { summary: `Score de conformité : ${snap.compliance.score}/100 (${snap.compliance.level})`, data: snap.compliance };
    },
  },
  {
    name: "calendrier_obligations",
    description: "Renvoie le calendrier des obligations (fiscales, sociales, sectorielles) et crée des rappels pour les échéances des 30 prochains jours.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const reminders = await syncObligationReminders(ctx.companyId);
      const snap = await company(ctx);
      return { summary: `${snap.obligations.filter((o) => !o.done).length} obligation(s) à venir, ${reminders.length} rappel(s) créé(s)`, data: snap.obligations.map((o) => ({ titre: o.title, echeance: o.dueDate.slice(0, 10), categorie: o.category, faite: o.done, exemple: o.isExample })) };
    },
  },
  {
    name: "veille_reglementaire",
    description: "Identifie les textes du corpus officiel pertinents pour le secteur de l'entreprise (nouveaux textes déposés par l'État en priorité).",
    parameters: { type: "object", properties: { mots_cles: { type: "array", items: { type: "string" } } } },
    async run(input, ctx) {
      const snap = await company(ctx);
      const keywords = strArr(input.mots_cles).length ? strArr(input.mots_cles) : snap.company.sectorKeywords;
      const alerts = regulatoryWatch(keywords, await listOfficialDocuments());
      return { summary: `${alerts.length} texte(s) officiel(s) à surveiller`, data: alerts };
    },
  },
  {
    name: "briefing_cofondateur",
    description: "Briefing du jour : priorités, approbations en attente, échéances, devis, score de conformité.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const s = await company(ctx);
      const pending = s.approvals.filter((a) => a.status === "en_attente");
      const openTasks = s.tasks.filter((t) => t.status !== "fait");
      const nextSteps = s.checklist.filter((c) => c.status !== "fait").slice(0, 2);
      const upcoming = s.obligations.filter((o) => !o.done).slice(0, 3);
      return {
        summary: `Briefing : ${pending.length} approbation(s), ${openTasks.length} tâche(s), conformité ${s.compliance.score}/100`,
        data: {
          approbations_en_attente: pending.map((a) => a.title),
          taches_ouvertes: openTasks.slice(0, 5).map((t) => ({ titre: t.title, echeance: t.dueDate?.slice(0, 10) })),
          prochaines_demarches: nextSteps.map((n) => n.title),
          echeances: upcoming.map((o) => ({ titre: o.title, date: o.dueDate.slice(0, 10) })),
          devis: s.quotes.map((q) => ({ id: q.id, statut: q.status })),
          conformite: s.compliance.score,
          recommandations: s.compliance.recommendations.slice(0, 4),
        },
      };
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));
