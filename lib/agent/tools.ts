import {
  generateBusinessPlan,
  generateLegalDocument,
  generateRoadmap,
  LEGAL_TEMPLATE_LABELS,
  type LegalTemplateKind,
} from "@/lib/cofounder/generators";
import { regulatoryWatch } from "@/lib/compliance";
import type { Citation } from "@/lib/legal/citations";
import { listOfficialDocuments } from "@/lib/legal/corpus";
import { groundingLabel, groundingMarkdown, groundQuery, type Grounding } from "@/lib/legal/grounding";
import { assertObjectInCompany } from "@/lib/workspace/access";
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

export type ToolContext = { companyId: string; citations: Citation[]; groundings?: Grounding[]; /** Outils découverts dynamiquement (connecteurs MCP / natifs). */ extraTools?: AgentTool[] };
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

const groundCache = new Map<string, { at: number; g: Grounding }>();

/**
 * Ancrage juridique d'une action : recherche dans le corpus officiel AVANT d'agir.
 * Les citations sont renumérotées [S1], [S2]… dans la conversation et le statut de couverture est conservé.
 */
export async function legalBasis(ctx: ToolContext, query: string, limit = 4): Promise<Grounding & { label: string }> {
  const key = `${limit}|${query}`;
  const hit = groundCache.get(key);
  const base = hit && Date.now() - hit.at < 10 * 60_000 ? hit.g : await groundQuery(query, limit);
  if (!hit || hit.g !== base) groundCache.set(key, { at: Date.now(), g: base });
  const offset = ctx.citations.length;
  const citations = base.citations.map((c, i) => ({ ...c, id: `S${offset + i + 1}` }));
  ctx.citations.push(...citations);
  const g: Grounding = { ...base, citations, sources: base.sources.map((src, i) => ({ ...src, id: `S${offset + i + 1}` })) };
  (ctx.groundings ??= []).push(g);
  return { ...g, label: groundingLabel(g) };
}

/** Résumé compact du fondement, renvoyé au modèle dans chaque résultat d'outil. */
function basisData(g: Grounding & { label: string }) {
  return {
    statut: g.status,
    libelle: g.label,
    sources: g.sources.map((x) => ({ id: x.id, document: x.document, page: x.page, articles: x.articles, exemple_non_officiel: x.isExample })),
    consigne: g.status === "non_couvert" ? "Aucun texte du corpus ne couvre ce point : dis-le explicitement, n'invente aucune règle." : "Cite ces sources [Sx] pour tout point juridique.",
  };
}

const sectorQuery = (c: { sector: string; sectorKeywords: string[]; legalForm: string }) =>
  `régime juridique ${c.sector} ${c.sectorKeywords.slice(0, 4).join(" ")} autorisation licence`;

const DOCUMENT_QUERIES: Record<string, string> = {
  statuts: "statuts société capital social associés gérant",
  contrat_prestation: "contrat prestation services obligations parties prix",
  nda: "confidentialité secret informations divulgation",
  contrat_travail: "contrat de travail employeur travailleur période d'essai salaire",
  pv_ag: "assemblée générale associés procès-verbal délibération",
};

export const TOOLS: AgentTool[] = [
  {
    name: "rechercher_textes_juridiques",
    description:
      "OUTIL PRIORITAIRE — à appeler EN PREMIER pour toute question ou action. Recherche dans le corpus juridique officiel fourni par l'État (lois, décrets, arrêtés, décisions) et renvoie des extraits numérotés [S1], [S2]… (document, page, articles) ainsi qu'un statut de couverture : fonde, partiel ou non_couvert. Si non_couvert, il faut le dire et ne rien inventer. Les extraits isExample=true sont des textes d'exemple NON officiels.",
    parameters: { type: "object", properties: { question: { type: "string", description: "Question juridique reformulée avec les mots-clés utiles" } }, required: ["question"] },
    async run(input, ctx) {
      const g = await legalBasis(ctx, str(input.question), 5);
      const official = g.citations.filter((c) => !c.isExample).length;
      const examples = g.citations.length - official;
      return {
        summary: `${g.label} — ${official} extrait(s) officiel(s)${examples ? ` + ${examples} exemple(s) non officiel(s)` : ""}${g.indexReady ? "" : " — index PDF absent (npm run index-documents)"}`,
        data: {
          couverture: { statut: g.status, taux: g.coverage, termes_trouves: g.matchedTerms, libelle: g.label },
          extraits: g.citations.map((c) => ({ id: c.id, document: c.legalTitle ?? c.title, categorie: c.category, page: c.page, articles: c.articles, isExample: c.isExample, extrait: c.excerpt.slice(0, 1200) })),
        },
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
    async run(input, ctx) {
      const list = await searchSuppliers({ need: str(input.besoin), category: str(input.categorie) || undefined, city: str(input.ville) || undefined });
      const g = await legalBasis(ctx, `${str(input.besoin)} homologation agrément autorisation importation`, 3);
      return {
        summary: `${list.length} fournisseur(s) trouvé(s) — ${g.label}`,
        data: {
          fondement_juridique: basisData(g),
          fournisseurs: list.slice(0, 8).map((s) => ({ id: s.id, nom: s.name, categorie: s.category, services: s.services, ville: s.city, note: s.rating, exemple: s.isExample })),
        },
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
      const g = await legalBasis(ctx, `contrat fourniture vente ${str(input.besoin)} obligations vendeur garantie`, 3);
      const created = await requestQuotes(ctx.companyId, { supplierIds: strArr(input.fournisseur_ids), need: str(input.besoin), quantity: str(input.quantite) || undefined, desiredDate: str(input.date_souhaitee) || undefined });
      return {
        summary: `${created.length} demande(s) de devis en attente d'approbation — ${g.label}`,
        data: { fondement_juridique: basisData(g), devis: created.map((c) => ({ devis: c.quote.id, fournisseur: c.supplier, approbation: c.approvalId })) },
      };
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
    async run(input, ctx) {
      await assertObjectInCompany("quotes", str(input.devis_id), ctx.companyId);
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
      const g = await legalBasis(ctx, sectorQuery(snap.company));
      const content = (str(input.contenu_markdown) || generateBusinessPlan(snap.company, str(input.notes))) + "\n" + groundingMarkdown(g);
      const doc = await saveDocument(ctx.companyId, { title: `Business plan — ${snap.company.name}`, kind: "business_plan", content }, "agent");
      return { summary: `Business plan enregistré dans Documents — ${g.label}`, data: { documentId: doc.id, fondement_juridique: basisData(g), apercu: content.slice(0, 600) } };
    },
  },
  {
    name: "generer_roadmap",
    description: "Génère et enregistre une roadmap (feuille de route) sur N mois.",
    parameters: { type: "object", properties: { horizon_mois: { type: "number" }, contenu_markdown: { type: "string" } } },
    async run(input, ctx) {
      const snap = await company(ctx);
      const months = typeof input.horizon_mois === "number" ? Math.min(Math.max(input.horizon_mois, 2), 24) : 6;
      const g = await legalBasis(ctx, sectorQuery(snap.company));
      const content = (str(input.contenu_markdown) || generateRoadmap(snap.company, months)) + "\n" + groundingMarkdown(g);
      const doc = await saveDocument(ctx.companyId, { title: `Roadmap ${months} mois`, kind: "roadmap", content }, "agent");
      return { summary: `Roadmap ${months} mois enregistrée — ${g.label}`, data: { documentId: doc.id, fondement_juridique: basisData(g), apercu: content.slice(0, 600) } };
    },
  },
  {
    name: "checklist_creation_entreprise",
    description: "Renvoie les démarches de création sous forme d'ÉTAPES JURIDIQUES SOURCÉES : pour chaque étape, statut, autorité, pièces et fondement dans le corpus officiel (ou « non couvert par le corpus »).",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const snap = await company(ctx);
      const done = snap.checklist.filter((s) => s.status === "fait").length;
      const steps = [];
      for (const s of snap.checklist) {
        const g = await legalBasis(ctx, `${s.title} ${s.authority}`, 2);
        steps.push({ id: s.id, ordre: s.order, titre: s.title, statut: s.status, autorite: s.authority, pieces: s.documents, exemple: s.isExample, fondement: { statut: g.status, libelle: g.label, sources: g.sources.filter((x) => !x.isExample).map((x) => x.id) } });
      }
      const covered = steps.filter((x) => x.fondement.statut !== "non_couvert").length;
      return { summary: `Démarches : ${done}/${snap.checklist.length} terminées — ${covered}/${steps.length} étape(s) fondée(s) sur le corpus officiel`, data: steps };
    },
  },
  {
    name: "mettre_a_jour_demarche",
    description: "Met à jour le statut d'une démarche de création (a_faire, en_cours, fait, bloque).",
    parameters: { type: "object", properties: { demarche_id: { type: "string" }, statut: { type: "string", enum: ["a_faire", "en_cours", "fait", "bloque"] }, note: { type: "string" } }, required: ["demarche_id", "statut"] },
    async run(input, ctx) {
      await assertObjectInCompany("checklist", str(input.demarche_id), ctx.companyId);
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
      const g = await legalBasis(ctx, `${DOCUMENT_QUERIES[kind] ?? LEGAL_TEMPLATE_LABELS[kind]} ${details.objet ?? ""}`.trim());
      const content = generateLegalDocument(kind, snap.company, snap.members, details) + "\n" + groundingMarkdown(g);
      const doc = await saveDocument(ctx.companyId, { title: `${LEGAL_TEMPLATE_LABELS[kind]}${details.partie ? ` — ${details.partie}` : ""}`, kind: kind === "statuts" ? "statuts" : kind === "pv_ag" ? "pv" : "contrat", content, needsReview: true }, "agent");
      return { summary: `Document généré : ${LEGAL_TEMPLATE_LABELS[kind]} (à valider) — ${g.label}`, data: { documentId: doc.id, fondement_juridique: basisData(g) } };
    },
  },
  {
    name: "score_conformite",
    description: "Calcule le score de conformité (0–100) de l'entreprise avec détail et recommandations.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const snap = await company(ctx);
      const g = await legalBasis(ctx, `obligations ${snap.company.sectorKeywords.slice(0, 4).join(" ")} sanctions déclaration`);
      return { summary: `Score de conformité : ${snap.compliance.score}/100 (${snap.compliance.level}) — ${g.label}`, data: { ...snap.compliance, fondement_juridique: basisData(g) } };
    },
  },
  {
    name: "calendrier_obligations",
    description: "Renvoie le calendrier des obligations (fiscales, sociales, sectorielles) et crée des rappels pour les échéances des 30 prochains jours.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const reminders = await syncObligationReminders(ctx.companyId);
      const snap = await company(ctx);
      const g = await legalBasis(ctx, `déclaration redevance échéance ${snap.company.sectorKeywords.slice(0, 3).join(" ")}`, 3);
      return {
        summary: `${snap.obligations.filter((o) => !o.done).length} obligation(s) à venir, ${reminders.length} rappel(s) créé(s) — ${g.label}`,
        data: { fondement_juridique: basisData(g), obligations: snap.obligations.map((o) => ({ titre: o.title, echeance: o.dueDate.slice(0, 10), categorie: o.category, faite: o.done, exemple: o.isExample })) },
      };
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
