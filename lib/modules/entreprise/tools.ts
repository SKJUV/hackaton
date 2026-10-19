import type { AgentTool, ToolContext } from "@/lib/agent/tools";
import { groundingLabel, groundQuery } from "@/lib/legal/grounding";
import { saveDocument } from "@/lib/workspace/service";
import { domainLabel } from "./analytics";
import { buildDataRoom, dataRoomIndex } from "./dataroom";
import { dueDiligence, dueDiligenceMarkdown } from "./duediligence";
import { riskProfile, runStress, sectorWatch, tenderAlerts } from "./insights";
import { buildFinancialExport, generateWeeklyReport, fmt, type ExportTarget } from "./reports";
import { dataOverview, financeOverview, importData } from "./service";
import type { CounterpartyKind, DatasetDomain } from "./types";

/**
 * Outils d'agent du module entreprise (exposés au LLM via function-calling ET au planificateur démo).
 * Aucun outil n'envoie quoi que ce soit à un tiers : ils lisent, calculent, et enregistrent des documents dans le workspace.
 * Les points juridiques passent par le corpus officiel (citations [Sx]) ; « non couvert » sinon.
 */

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? v.split(/[,;]+/).map((x) => x.trim()).filter(Boolean) : []);

/** Fondement juridique ajouté au contexte de la conversation (numérotation [Sx] continue). Sans import de lib/agent/tools (évite un cycle). */
async function basis(ctx: ToolContext, query: string, limit = 3, must?: RegExp) {
  const raw = await groundQuery(query, must ? 6 : limit);
  // Contrôle de pertinence : on ne garde que les extraits officiels qui traitent réellement le sujet.
  const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const kept = must ? raw.citations.filter((c) => c.isExample || must.test(fold(c.excerpt))).slice(0, limit) : raw.citations;
  const base = must ? { ...raw, citations: kept, sources: raw.sources.filter((s) => kept.some((c) => c.file === s.file && c.page === s.page)), status: kept.some((c) => !c.isExample) ? raw.status : ("non_couvert" as const) } : raw;
  const offset = ctx.citations.length;
  const citations = base.citations.map((c, i) => ({ ...c, id: `S${offset + i + 1}` }));
  ctx.citations.push(...citations);
  const g = { ...base, citations, sources: base.sources.map((s, i) => ({ ...s, id: `S${offset + i + 1}` })) };
  (ctx.groundings ??= []).push(g);
  const label = groundingLabel(g);
  return {
    statut: g.status,
    libelle: label,
    sources: g.sources.map((x) => ({ id: x.id, document: x.document, page: x.page, articles: x.articles, exemple_non_officiel: x.isExample })),
    consigne: g.status === "non_couvert" ? "Aucun texte du corpus ne couvre ce point : dis-le explicitement, n'invente aucune règle." : "Cite ces sources [Sx] pour tout point juridique.",
  };
}

const EXAMPLE_NOTE = "Les données marquées exemple sont FICTIVES : le dire explicitement à l'utilisateur, ne jamais les présenter comme réelles.";

export const ENTREPRISE_TOOLS: AgentTool[] = [
  {
    name: "importer_donnees",
    description: "Importe un fichier CSV (contenu texte collé) de ventes, finances, RH ou clients dans le workspace, reconnaît les colonnes et le structure. Les fichiers Excel (.xlsx) s'importent depuis l'onglet Entreprise › Données.",
    parameters: {
      type: "object",
      properties: {
        nom_fichier: { type: "string", description: "Nom du fichier, ex. ventes-mars.csv" },
        contenu_csv: { type: "string", description: "Contenu CSV avec ligne d'en-tête" },
        domaine: { type: "string", enum: ["ventes", "finances", "rh", "clients"], description: "Optionnel : détecté automatiquement sinon" },
      },
      required: ["nom_fichier", "contenu_csv"],
    },
    async run(input, ctx) {
      const res = await importData(ctx.companyId, { fileName: str(input.nom_fichier, "import.csv"), text: str(input.contenu_csv), domain: (str(input.domaine) || undefined) as DatasetDomain | undefined }, "agent");
      return { summary: `${res.length} table(s) importée(s) : ${res.map((d) => `${d.name} (${domainLabel[d.domain]}, ${d.rows} lignes)`).join(", ")}`, data: res.map(({ preview: _p, ...d }) => d) };
    },
  },
  {
    name: "tableau_de_bord_donnees",
    description: "Tableaux de bord automatiques sur les données importées (ventes, finances, RH, clients) : indicateurs clés, évolutions mensuelles, répartitions.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const o = await dataOverview(ctx.companyId);
      return {
        summary: `${o.datasets.length} table(s), ${o.dashboards.length} tableau(x) de bord${o.isExample ? " — données d'EXEMPLE" : ""}`,
        data: { avertissement: o.isExample ? EXAMPLE_NOTE : undefined, tableaux: o.dashboards.map((d) => ({ domaine: d.domain, exemple: d.isExample, indicateurs: d.kpis, repartitions: d.breakdowns.map((b) => ({ titre: b.label, top: b.items.slice(0, 4) })) })) },
      };
    },
  },
  {
    name: "detecter_anomalies",
    description: "Détecte les anomalies dans les données importées : pics/chutes mensuels, montants aberrants, doublons, ventes négatives, retards de paiement, concentration client, salaires atypiques.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const o = await dataOverview(ctx.companyId);
      return { summary: `${o.anomalies.length} anomalie(s) dont ${o.anomalies.filter((a) => a.severity === "critique").length} critique(s)`, data: { avertissement: o.isExample ? EXAMPLE_NOTE : undefined, anomalies: o.anomalies.slice(0, 15) } };
    },
  },
  {
    name: "rapport_hebdomadaire",
    description: "Génère le rapport exécutif hebdomadaire (synthèse, indicateurs, trésorerie, anomalies, risques, échéances, recommandations) et l'enregistre dans Documents.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const r = await generateWeeklyReport(ctx.companyId, { trigger: "agent" });
      return { summary: `« ${r.title} » enregistré dans Documents`, data: { rapportId: r.id, documentId: r.documentId, periode: `${r.periodStart} → ${r.periodEnd}`, apercu: r.markdown.slice(0, 2500) } };
    },
  },
  {
    name: "tableau_financier",
    description: "Tableau de bord financier : revenus, dépenses, budget vs réalisé, trésorerie actuelle et prévisionnelle (6 mois), autonomie, alertes de risque de trésorerie.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const f = await financeOverview(ctx.companyId);
      return {
        summary: `Trésorerie ${fmt(f.currentCash)} ${f.currency}, ${f.alerts.length} alerte(s)${f.isExample ? " — EXEMPLE" : ""}`,
        data: { avertissement: f.isExample ? EXAMPLE_NOTE : undefined, tresorerie: f.currentCash, totaux: f.totals, prevision: f.forecast, budget: f.budget, alertes: f.alerts, hypotheses: f.hypotheses },
      };
    },
  },
  {
    name: "exporter_rapport_financier",
    description: "Prépare un rapport financier pour les investisseurs, la banque ou l'administration fiscale, l'enregistre dans Documents et fournit les liens de téléchargement (PDF, Markdown, CSV). Les obligations fiscales sont citées depuis le corpus officiel, sinon marquées exemple.",
    parameters: { type: "object", properties: { cible: { type: "string", enum: ["investisseurs", "banque", "fisc"] } }, required: ["cible"] },
    async run(input, ctx) {
      const cible = (["investisseurs", "banque", "fisc"].includes(str(input.cible)) ? str(input.cible) : "investisseurs") as ExportTarget;
      const fondement = cible === "fisc" ? await basis(ctx, "déclaration impôts taxes redevances contributions paiement", 3, /impot|fiscal|redevance|contribution/) : undefined;
      const b = await buildFinancialExport(ctx.companyId, cible);
      const doc = await saveDocument(ctx.companyId, { title: `${b.title} — ${new Date().toISOString().slice(0, 10)}`, kind: "note", content: b.markdown }, "agent");
      const base = `/api/entreprise/export?companyId=${encodeURIComponent(ctx.companyId)}&type=finance&cible=${cible}`;
      return { summary: `${b.title} enregistré dans Documents${b.isExample ? " (données d'EXEMPLE)" : ""}`, data: { documentId: doc.id, telechargements: { pdf: `${base}&format=pdf`, markdown: `${base}&format=md`, zip: `${base}&format=zip` }, fondement_juridique: fondement, apercu: b.markdown.slice(0, 2000) } };
    },
  },
  {
    name: "veille_sectorielle",
    description: "Veille sectorielle filtrée par le profil de l'entreprise : textes officiels pertinents (veille réglementaire du corpus), publications du régulateur, signaux de marché (exemple) et indicateurs macroéconomiques réels (Banque mondiale).",
    parameters: { type: "object", properties: { mots_cles: { type: "array", items: { type: "string" } } } },
    async run(input, ctx) {
      const w = await sectorWatch(ctx.companyId, { keywords: strArr(input.mots_cles) });
      return {
        summary: `${w.regulatory.length} texte(s) officiel(s), ${w.publications.length} publication(s), ${w.signals.length} signal(aux) d'exemple, macro ${w.macro.status.live ? "réelle" : "indisponible"}`,
        data: { profil: w.profile, reglementaire: w.regulatory.slice(0, 6).map((a) => ({ titre: a.title, source: a.source, mots: a.matched, action: a.action })), publications: w.publications.map((p) => ({ titre: p.title, source: p.source })), signaux_exemple: w.signals, macro: w.macro.items, notes: w.notes },
      };
    },
  },
  {
    name: "alertes_appels_offres",
    description: "Alertes sur les appels d'offres publics correspondant au profil : avis réels de la Banque mondiale pour le Cameroun (API publique), archives d'avis de l'ART présentes dans le corpus, exemples marqués, et portails officiels nationaux (ARMP, COLEPS).",
    parameters: { type: "object", properties: { mots_cles: { type: "array", items: { type: "string" } } } },
    async run(input, ctx) {
      const t = await tenderAlerts(ctx.companyId, { keywords: strArr(input.mots_cles) });
      return {
        summary: `${t.live.matching.length} avis réel(s) correspondant(s) (Banque mondiale${t.live.status.live ? "" : " indisponible"}), ${t.archive.items.length} archive(s) ART, ${t.examples.length} exemple(s)`,
        data: { source_reelle: t.live.status, correspondants: t.live.matching.slice(0, 8), autres_avis_ouverts: t.live.others.slice(0, 4).map((x) => ({ titre: x.title, echeance: x.deadline, url: x.url })), archives_art: t.archive.items.slice(0, 5).map((a) => ({ titre: a.title, fichier: a.source, mots: a.matched })), exemples: t.examples, portails_officiels: t.portals },
      };
    },
  },
  {
    name: "profil_risque",
    description: "Profil de risque de l'entreprise (change, crédit client, opérationnel, réglementaire, liquidité) avec scores, facteurs, stratégies de couverture et alertes. Le risque réglementaire cite le corpus officiel.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const r = await riskProfile(ctx.companyId);
      const fondement = await basis(ctx, r.axes.find((a) => a.id === "reglementaire")?.legal?.query ?? "obligations autorisation licence");
      return { summary: `Risque global ${r.overall}/100 (${r.level}), ${r.alerts.length} alerte(s)`, data: { avertissement: r.isExample ? EXAMPLE_NOTE : undefined, global: r.overall, axes: r.axes.map(({ legal: _l, ...a }) => a), alertes: r.alerts, fondement_juridique: fondement } };
    },
  },
  {
    name: "simulation_stress",
    description: "Simule des scénarios de stress sur la trésorerie (baisse des ventes, hausse des coûts, choc de change, retards de paiement, perte du premier client) + un scénario personnalisé.",
    parameters: {
      type: "object",
      properties: {
        baisse_ventes_pct: { type: "number", description: "ex. 20 pour −20 %" },
        hausse_couts_pct: { type: "number" },
        choc_change_pct: { type: "number" },
        retard_paiement_jours: { type: "number" },
        perte_premier_client: { type: "boolean" },
      },
    },
    async run(input, ctx) {
      const v = { r: num(input.baisse_ventes_pct), c: num(input.hausse_couts_pct), f: num(input.choc_change_pct), d: num(input.retard_paiement_jours), l: input.perte_premier_client === true };
      const custom = v.r || v.c || v.f || v.d || v.l ? { revenueShock: v.r ? -Math.abs(v.r) / 100 : undefined, expenseShock: v.c ? v.c / 100 : undefined, fxShock: v.f ? v.f / 100 : undefined, paymentDelayDays: v.d, loseTopClient: v.l || undefined } : undefined;
      const s = await runStress(ctx.companyId, custom);
      const breaches = s.results.filter((r) => r.breach);
      return { summary: `${s.results.length} scénario(s), ${breaches.length} avec rupture de trésorerie${s.base.isExample ? " — EXEMPLE" : ""}`, data: { avertissement: s.base.isExample ? EXAMPLE_NOTE : undefined, base: { tresorerie: s.base.currentCash, autonomie_mois: s.base.runwayMonths }, scenarios: s.results } };
    },
  },
  {
    name: "due_diligence",
    description: "Due diligence d'un partenaire, fournisseur, client ou investisseur : fiche de signaux à partir des données disponibles (historique commercial, encours, devis, notes) et checklist juridique citée depuis le corpus officiel. Enregistre la fiche dans Documents.",
    parameters: { type: "object", properties: { nom: { type: "string" }, type: { type: "string", enum: ["partenaire", "fournisseur", "client", "investisseur"] } }, required: ["nom"] },
    async run(input, ctx) {
      const dd = await dueDiligence(ctx.companyId, { name: str(input.nom), kind: (str(input.type) || undefined) as CounterpartyKind | undefined });
      const fondement = await basis(ctx, dd.checklist.filter((c) => c.status !== "non_couvert").map((c) => c.query)[0] ?? dd.checklist[0].query);
      const doc = await saveDocument(ctx.companyId, { title: `Due diligence — ${dd.counterparty.name}`, kind: "note", content: dueDiligenceMarkdown(dd) }, "agent");
      return { summary: `${dd.counterparty.name} : ${dd.score}/100 (${dd.verdict})${dd.isExample ? " — EXEMPLE" : ""}`, data: { documentId: doc.id, score: dd.score, verdict: dd.verdict, signaux: dd.signals, manquant: dd.missing, checklist: dd.checklist.map((c) => ({ point: c.label, statut: c.status, fondement: c.statusLabel })), limites: dd.limits, fondement_juridique: fondement } };
    },
  },
  {
    name: "generer_data_room",
    description: "Génère la data room investisseur (statuts, pacte, conformité, chiffres, business plan, risques, score de préparation), enregistre l'index dans Documents et fournit les liens d'export ZIP et PDF. Les pièces manquantes sont signalées.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const dr = await buildDataRoom(ctx.companyId);
      const doc = await saveDocument(ctx.companyId, { title: `Data room investisseur — index ${dr.generatedAt.slice(0, 10)}`, kind: "note", content: dataRoomIndex(dr) }, "agent");
      const base = `/api/entreprise/export?companyId=${encodeURIComponent(ctx.companyId)}&type=dataroom`;
      return { summary: `Data room : score de préparation ${dr.score}/100, ${dr.sections.filter((s) => s.status === "manquant").length} pièce(s) manquante(s)`, data: { documentId: doc.id, score: dr.score, detail: dr.scoreDetail, sections: dr.sections.map((s) => ({ titre: s.title, statut: s.status, note: s.note })), telechargements: { zip: `${base}&format=zip`, pdf: `${base}&format=pdf` }, avertissement: dr.isExample ? EXAMPLE_NOTE : undefined } };
    },
  },
];
