import { getSnapshot, log, saveDocument } from "@/lib/workspace/service";
import { newId, nowIso, withData } from "@/lib/workspace/store";
import { buildDashboards, detectAnomalies, domainLabel } from "./analytics";
import { toCsv } from "./csv";
import { computeFinance, stressTest, type FinanceView } from "./finance";
import { citedMarkdown, fiscalObligations } from "./legal";
import { riskProfile } from "./insights";
import { getState, storeOf } from "./service";
import type { Dataset, WeeklyReport } from "./types";

/** Rapport exécutif hebdomadaire et exports financiers (investisseurs, banque, fisc). */

export const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
const d10 = (d: Date) => d.toISOString().slice(0, 10);
const frDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "Africa/Douala" });

function weekSales(datasets: Dataset[], now: Date) {
  const rows = datasets.filter((d) => d.domain === "ventes").flatMap((d) => d.rows).filter((r) => r.date && r.montant !== undefined);
  const end = d10(new Date(now.getTime() - 86400000));
  const start = d10(new Date(now.getTime() - 7 * 86400000));
  const pStart = d10(new Date(now.getTime() - 14 * 86400000));
  const cur = rows.filter((r) => r.date! >= start && r.date! <= end).reduce((s, r) => s + r.montant!, 0);
  const prev = rows.filter((r) => r.date! >= pStart && r.date! < start).reduce((s, r) => s + r.montant!, 0);
  return { start, end, cur, prev, hasDaily: rows.some((r) => r.date! >= pStart), delta: prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null };
}

const exampleBanner = (isExample: boolean) => (isExample ? "> ⚠️ **Données d'EXEMPLE (fictives)** : ce rapport illustre le fonctionnement ; aucun chiffre n'est réel. Importez vos fichiers pour un rapport réel.\n" : "");

export async function buildWeeklyReport(companyId: string, now = new Date()) {
  const st = await getState(companyId, now);
  const snap = await getSnapshot(companyId); // séquentiel : le store JSON ne supporte pas deux premiers chargements concurrents
  const dashboards = buildDashboards(st.datasets, now);
  const anomalies = detectAnomalies(st.datasets, now);
  const finance = computeFinance(st.datasets, st.budgets, st.settings, now);
  const risk = await riskProfile(companyId, now);
  const week = weekSales(st.datasets, now);
  const isExample = st.datasets.some((d) => d.isExample) || finance.settings.isExample;
  const upcoming = snap.obligations.filter((o) => !o.done && new Date(o.dueDate).getTime() - now.getTime() < 14 * 86400000);
  const critical = anomalies.filter((a) => a.severity === "critique");

  const synth: string[] = [];
  if (week.hasDaily) synth.push(`Ventes de la semaine : **${fmt(week.cur)} XAF**${week.delta !== null ? ` (${week.delta >= 0 ? "+" : ""}${week.delta} % vs semaine précédente)` : ""}.`);
  if (finance.hasData) synth.push(`Trésorerie estimée : **${fmt(finance.currentCash)} ${finance.currency}**${finance.totals.runwayMonths !== null ? `, autonomie ${finance.totals.runwayMonths} mois` : ""}.`);
  for (const a of finance.alerts.filter((x) => x.severity === "critique").slice(0, 2)) synth.push(`⛔ ${a.title}.`);
  synth.push(`${anomalies.length} anomalie(s) détectée(s) dont ${critical.length} critique(s).`);
  synth.push(`Profil de risque global : ${risk.overall}/100 (${risk.level}).`);
  if (!st.datasets.length) synth.push("Aucune donnée importée : importez vos fichiers ventes, finances, RH et clients (CSV ou Excel).");

  const lines = [
    `# Rapport exécutif hebdomadaire — ${st.company.name}`,
    "",
    `Semaine du ${frDate(week.start)} au ${frDate(week.end)} · généré le ${now.toLocaleString("fr-FR", { timeZone: "Africa/Douala" })} (heure de Douala)`,
    "",
    exampleBanner(isExample),
    "## Synthèse",
    ...synth.map((s) => `- ${s}`),
    "",
    "## Indicateurs clés",
    ...dashboards.flatMap((d) => [`### ${domainLabel[d.domain]}${d.isExample ? " (exemple)" : ""}`, ...d.kpis.map((k) => `- ${k.label} : ${fmt(k.value)}${k.unit ? ` ${k.unit}` : ""}${k.delta !== undefined && k.delta !== null ? ` (${k.delta >= 0 ? "+" : ""}${k.delta} %)` : ""}${k.hint ? ` — ${k.hint}` : ""}`), ""]),
    "## Trésorerie prévisionnelle",
    ...(finance.hasData ? ["| Mois | Recettes | Dépenses | Solde fin de mois |", "|---|---|---|---|", ...finance.forecast.map((f) => `| ${f.period} | ${fmt(f.revenue)} | ${fmt(f.expenses)} | ${fmt(f.balance)} |`)] : ["- Aucune donnée financière."]),
    ...finance.alerts.map((a) => `- ${a.severity === "critique" ? "⛔" : "⚠️"} ${a.title} — ${a.detail}`),
    "",
    "## Anomalies à traiter",
    ...(anomalies.length ? anomalies.slice(0, 8).map((a) => `- ${a.severity === "critique" ? "⛔" : a.severity === "attention" ? "⚠️" : "ℹ️"} [${domainLabel[a.domain]}] ${a.title} — ${a.detail}`) : ["- Aucune anomalie détectée."]),
    "",
    "## Risques",
    ...risk.axes.map((a) => `- ${a.label} : ${a.score}/100 (${a.level})${a.basis === "exemple" ? " — exemple" : ""}`),
    "",
    "## Échéances des 14 prochains jours",
    ...(upcoming.length ? upcoming.map((o) => `- ${o.dueDate.slice(0, 10)} — ${o.title}${o.isExample ? " (échéance d'exemple)" : ""}`) : ["- Aucune."]),
    "",
    "## Recommandations",
    ...[
      ...finance.alerts.slice(0, 2).map((a) => a.detail.split(" Actions : ")[1] ? `Trésorerie : ${a.detail.split(" Actions : ")[1]}` : ""),
      ...critical.slice(0, 2).map((a) => `Vérifier : ${a.title}.`),
      ...risk.axes.filter((a) => a.score >= 55).slice(0, 2).map((a) => `${a.label} : ${a.strategies[0]}`),
      ...snap.compliance.recommendations.slice(0, 2),
    ]
      .filter(Boolean)
      .map((r) => `- ${r}`),
    "",
    "_Rapport généré automatiquement par Co-founder à partir des données du workspace. Les points juridiques renvoient au corpus officiel ; les chiffres ne sont pas audités._",
  ];
  return { title: `Rapport exécutif hebdomadaire — ${week.end}`, markdown: lines.join("\n"), periodStart: week.start, periodEnd: week.end };
}

/**
 * Génère, enregistre (Documents + historique) et journalise le rapport hebdomadaire.
 * Point d'entrée pour la future routine planifiée : `generateWeeklyReport(companyId, { trigger: "routine" })`.
 */
export async function generateWeeklyReport(companyId: string, opts: { trigger?: WeeklyReport["trigger"]; now?: Date; actor?: string } = {}) {
  const now = opts.now ?? new Date();
  const r = await buildWeeklyReport(companyId, now);
  const actor = opts.actor ?? (opts.trigger === "routine" ? "routine" : "agent");
  const doc = await saveDocument(companyId, { title: r.title, kind: "note", content: r.markdown }, actor);
  const report: WeeklyReport = { id: newId("rap"), companyId, periodStart: r.periodStart, periodEnd: r.periodEnd, title: r.title, markdown: r.markdown, documentId: doc.id, trigger: opts.trigger ?? "manuel", createdAt: nowIso() };
  await withData((data) => {
    const s = storeOf(data);
    (s.reports ??= []).push(report);
    const mine = s.reports.filter((x) => x.companyId === companyId);
    if (mine.length > 52) s.reports = s.reports.filter((x) => x.companyId !== companyId || mine.slice(-52).includes(x));
    log(data, companyId, actor, "rapport.hebdomadaire", `${r.title} (${report.trigger}).`);
  });
  return report;
}

/* ---------------------------------------------------------- Exports financiers */

export type ExportTarget = "investisseurs" | "banque" | "fisc";
export type ExportBundle = { title: string; markdown: string; csv: { name: string; content: string }[]; isExample: boolean };

function historyCsv(f: FinanceView) {
  return toCsv(["Mois", "Recettes", "Dépenses", "Flux net", "Solde"], f.history.map((h) => [h.period, h.revenue, h.expenses, h.net, h.balance]));
}
function forecastCsv(f: FinanceView) {
  return toCsv(["Mois", "Recettes projetées", "Dépenses projetées", "Flux net", "Solde projeté"], f.forecast.map((h) => [h.period, h.revenue, h.expenses, h.net, h.balance]));
}
const table = (rows: { period: string; revenue: number; expenses: number; net: number; balance: number }[]) => ["| Mois | Recettes | Dépenses | Flux net | Solde |", "|---|---|---|---|---|", ...rows.map((h) => `| ${h.period} | ${fmt(h.revenue)} | ${fmt(h.expenses)} | ${fmt(h.net)} | ${fmt(h.balance)} |`)];

export async function buildFinancialExport(companyId: string, target: ExportTarget, now = new Date()): Promise<ExportBundle> {
  const st = await getState(companyId, now);
  const snap = await getSnapshot(companyId); // séquentiel : le store JSON ne supporte pas deux premiers chargements concurrents
  const f = computeFinance(st.datasets, st.budgets, st.settings, now);
  const dashboards = buildDashboards(st.datasets, now);
  const isExample = f.isExample;
  const head = (t: string) => [`# ${t} — ${st.company.name}`, "", `${st.company.legalForm} · ${st.company.sector} · ${st.company.city} · édité le ${frDate(d10(now))}`, "", exampleBanner(isExample), "_Chiffres issus des données importées, non audités. Montants en " + f.currency + "._", ""];
  const csv = [
    { name: "historique-mensuel.csv", content: historyCsv(f) },
    { name: "tresorerie-previsionnelle.csv", content: forecastCsv(f) },
  ];

  if (target === "investisseurs") {
    const risk = await riskProfile(companyId, now);
    const rh = dashboards.find((d) => d.domain === "rh");
    const md = [
      ...head("Rapport investisseurs"),
      "## Indicateurs clés",
      `- Recettes (12 derniers mois disponibles) : ${fmt(f.totals.revenue12)}`,
      `- Dépenses (12 derniers mois disponibles) : ${fmt(f.totals.expenses12)}`,
      `- Croissance mensuelle moyenne des recettes : ${f.totals.growthPct ?? "—"} %`,
      `- Consommation nette mensuelle (burn) : ${fmt(f.totals.burnMonthly)}`,
      `- Trésorerie estimée : ${fmt(f.currentCash)} · autonomie : ${f.totals.runwayMonths ?? "flux positifs"} ${f.totals.runwayMonths !== null ? "mois" : ""}`,
      ...(rh ? rh.kpis.slice(0, 2).map((k) => `- ${k.label} : ${fmt(k.value)}${k.unit ? ` ${k.unit}` : ""}`) : []),
      "",
      "## Historique mensuel",
      ...table(f.history),
      "",
      "## Trésorerie prévisionnelle (6 mois)",
      ...table(f.forecast),
      "",
      "Hypothèses :",
      ...f.hypotheses.map((h) => `- ${h}`),
      "",
      "## Budget vs réalisé (dernier mois complet)",
      "| Poste | Budget | Réalisé | Écart |",
      "|---|---|---|---|",
      ...f.budget.map((b) => `| ${b.category} | ${fmt(b.budget)} | ${fmt(b.actual)} | ${b.variancePct ?? "—"} % |`),
      "",
      "## Profil de risque",
      `- Global : ${risk.overall}/100 (${risk.level})`,
      ...risk.axes.map((a) => `- ${a.label} : ${a.score}/100 — ${a.drivers[0]}`),
      "",
      "## Conformité",
      `- Score de conformité : ${snap.compliance.score}/100 (${snap.compliance.level})`,
    ];
    return { title: "Rapport investisseurs", markdown: md.join("\n"), csv, isExample };
  }

  if (target === "banque") {
    const { results } = stressTest(st.datasets, st.budgets, st.settings, now);
    const clients = dashboards.find((d) => d.domain === "clients");
    const coverage = f.totals.expenses12 ? Math.round((f.totals.revenue12 / f.totals.expenses12) * 100) / 100 : null;
    const md = [
      ...head("Dossier bancaire — situation et prévision de trésorerie"),
      "## Position de trésorerie",
      `- Solde estimé au ${frDate(d10(now))} : ${fmt(f.currentCash)}`,
      `- Seuil de sécurité retenu : ${fmt(f.settings.safetyCash)}`,
      `- Ratio recettes / dépenses (période disponible) : ${coverage ?? "—"}`,
      ...(clients ? clients.kpis.slice(1, 4).map((k) => `- ${k.label} : ${fmt(k.value)}${k.unit ? ` ${k.unit}` : ""}`) : []),
      "",
      "## Flux mensuels",
      ...table(f.history),
      "",
      "## Prévision (6 mois)",
      ...table(f.forecast),
      ...f.hypotheses.map((h) => `- ${h}`),
      "",
      "## Résistance aux chocs (stress tests)",
      "| Scénario | Solde minimum | Mois | Rupture |",
      "|---|---|---|---|",
      ...results.map((r) => `| ${r.label} | ${fmt(r.minBalance)} | ${r.minPeriod} | ${r.breach ?? "non"} |`),
      "",
      "## Alertes",
      ...(f.alerts.length ? f.alerts.map((a) => `- ${a.title} — ${a.detail}`) : ["- Aucune alerte."]),
    ];
    csv.push({ name: "stress-tests.csv", content: toCsv(["Scénario", "Solde minimum", "Mois", "Rupture", "Solde fin d'horizon"], results.map((r) => [r.label, r.minBalance, r.minPeriod, r.breach ?? "non", r.endBalance])) });
    return { title: "Dossier bancaire", markdown: md.join("\n"), csv, isExample };
  }

  // Fisc
  const fiscal = await fiscalObligations();
  const ventes = dashboards.find((d) => d.domain === "ventes");
  const rh = dashboards.find((d) => d.domain === "rh");
  const revenueSeries = ventes?.series[0]?.points ?? f.history.map((h) => ({ period: h.period, value: h.revenue }));
  const covered = fiscal.filter((p) => p.status !== "non_couvert");
  const md = [
    ...head("Éléments pour l'administration fiscale"),
    "> Ce document rassemble les bases chiffrées ; il ne calcule aucun impôt : les taux et barèmes ne sont pas présents dans le corpus officiel disponible.",
    "",
    "## Chiffre d'affaires mensuel",
    "| Mois | Chiffre d'affaires |",
    "|---|---|",
    ...revenueSeries.map((p) => `| ${p.period} | ${fmt(p.value)} |`),
    "",
    ...(rh ? ["## Masse salariale", ...rh.kpis.slice(0, 2).map((k) => `- ${k.label} : ${fmt(k.value)}${k.unit ? ` ${k.unit}` : ""}`), ""] : []),
    "## Obligations fiscales et parafiscales — fondement juridique",
    ...fiscal.map(citedMarkdown),
    "",
    covered.length ? "" : "> ⚠️ Aucune obligation fiscale n'est couverte par le corpus officiel actuel (corpus sectoriel postes/télécoms/TIC). Les échéances ci-dessous sont des EXEMPLES.",
    "## Calendrier des échéances",
    ...snap.obligations.filter((o) => o.category === "fiscal" || o.category === "sectoriel").map((o) => `- ${o.dueDate.slice(0, 10)} — ${o.title}${o.isExample ? " — **exemple, non officiel**" : ""}${o.done ? " (fait)" : ""}`),
  ];
  csv.push({ name: "chiffre-affaires-mensuel.csv", content: toCsv(["Mois", "Chiffre d'affaires"], revenueSeries.map((p) => [p.period, p.value])) });
  return { title: "Éléments fiscaux", markdown: md.join("\n"), csv, isExample };
}
