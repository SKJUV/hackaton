import { completeMonths, month, sumBy } from "./analytics";
import type { BudgetLine, Dataset, FinanceSettings, Severity } from "./types";

/** Tableau de bord financier : budget, dépenses, revenus, trésorerie prévisionnelle et alertes. */

export type Flow = { date: string; amount: number; category: string; source: string };
export type MonthRow = { period: string; revenue: number; expenses: number; net: number; balance: number };
export type ForecastRow = { period: string; revenue: number; expenses: number; net: number; balance: number };
export type BudgetRow = { category: string; budget: number; actual: number; average: number; variancePct: number | null; status: "ok" | "depassement" | "sous_consomme" };
export type CashAlert = { severity: Severity; title: string; detail: string };
export type StressParams = { revenueShock?: number; expenseShock?: number; fxShock?: number; paymentDelayDays?: number; loseTopClient?: boolean };

export type FinanceView = {
  currency: string;
  isExample: boolean;
  hasData: boolean;
  basis: "journal_financier" | "ventes_uniquement" | "aucune";
  settings: FinanceSettings;
  currentCash: number;
  history: MonthRow[];
  forecast: ForecastRow[];
  budget: BudgetRow[];
  totals: { revenue12: number; expenses12: number; burnMonthly: number; runwayMonths: number | null; growthPct: number | null };
  hypotheses: string[];
  alerts: CashAlert[];
};

const round = (n: number) => Math.round(n);
const addMonths = (period: string, k: number) => {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.toISOString().slice(0, 7);
};
const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

export function cashFlows(datasets: Dataset[]): { flows: Flow[]; basis: FinanceView["basis"] } {
  const fin = datasets.filter((d) => d.domain === "finances");
  if (fin.length)
    return { basis: "journal_financier", flows: fin.flatMap((d) => d.rows.filter((r) => r.date && r.montant !== undefined).map((r) => ({ date: r.date!, amount: r.montant!, category: r.categorie ?? (r.montant! >= 0 ? "Recettes" : "Non classé"), source: d.name }))) };
  const ventes = datasets.filter((d) => d.domain === "ventes");
  if (ventes.length) return { basis: "ventes_uniquement", flows: ventes.flatMap((d) => d.rows.filter((r) => r.date && r.montant !== undefined).map((r) => ({ date: r.date!, amount: r.montant!, category: "Ventes", source: d.name }))) };
  return { basis: "aucune", flows: [] };
}

function topClientShare(datasets: Dataset[]): { name: string; share: number } | null {
  const rows = datasets.filter((d) => d.domain === "ventes").flatMap((d) => d.rows).filter((r) => r.montant && r.client);
  const total = rows.reduce((s, r) => s + r.montant!, 0);
  if (!total) return null;
  const top = [...sumBy(rows, (r) => r.client, (r) => r.montant!).entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? { name: top[0], share: top[1] / total } : null;
}

export function computeFinance(datasets: Dataset[], budgets: BudgetLine[], settings: FinanceSettings, now = new Date(), stress: StressParams = {}, horizon = 6): FinanceView {
  const { flows, basis } = cashFlows(datasets);
  const after = flows.filter((f) => f.date >= settings.openingDate);
  const currentCash = settings.openingCash + after.filter((f) => f.date <= now.toISOString().slice(0, 10)).reduce((s, f) => s + f.amount, 0);

  const rev = completeMonths([...sumBy(flows.filter((f) => f.amount > 0), (f) => month(f.date), (f) => f.amount)].map(([period, value]) => ({ period, value })), now);
  const exp = completeMonths([...sumBy(flows.filter((f) => f.amount < 0), (f) => month(f.date), (f) => -f.amount)].map(([period, value]) => ({ period, value })), now);
  const periods = [...new Set([...rev, ...exp].map((p) => p.period))].sort();
  let bal = settings.openingCash;
  const openingPeriod = settings.openingDate.slice(0, 7);
  const history: MonthRow[] = periods.map((period) => {
    const r = rev.find((p) => p.period === period)?.value ?? 0;
    const e = exp.find((p) => p.period === period)?.value ?? 0;
    if (period >= openingPeriod) bal += r - e;
    return { period, revenue: round(r), expenses: round(e), net: round(r - e), balance: round(bal) };
  });

  const last3 = history.slice(-3);
  const avg = (k: "revenue" | "expenses") => (last3.length ? last3.reduce((s, h) => s + h[k], 0) / last3.length : 0);
  const growths = last3.slice(1).map((h, i) => (last3[i].revenue ? (h.revenue - last3[i].revenue) / last3[i].revenue : 0));
  const rawGrowth = growths.length ? growths.reduce((s, g) => s + g, 0) / growths.length : 0;
  // Les apports ponctuels (levée, apport en capital) ne sont pas récurrents : on projette les recettes d'exploitation.
  const recurringRevenue = basis === "journal_financier" ? avgRecurring(flows, last3.map((h) => h.period)) : avg("revenue");
  const growth = Math.max(-0.15, Math.min(0.1, rawGrowth));
  const baseExpenses = avg("expenses");
  const top = stress.loseTopClient ? topClientShare(datasets) : null;
  const delayShare = Math.min(1, Math.max(0, (stress.paymentDelayDays ?? 0) / 30));

  const forecast: ForecastRow[] = [];
  let cash = currentCash;
  const startPeriod = addMonths(now.toISOString().slice(0, 7), 0);
  let carried = 0;
  // Mois en cours : seuls les jours restants sont projetés (le solde actuel inclut déjà les flux passés du mois).
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const remaining = Math.max(0, (daysInMonth - now.getUTCDate() + 1) / daysInMonth);
  for (let k = 0; k < horizon; k++) {
    const period = addMonths(startPeriod, k);
    const share = k === 0 ? remaining : 1;
    let revenue = recurringRevenue * (1 + growth) ** (k + 1) * share;
    revenue *= 1 + (stress.revenueShock ?? 0);
    if (top) revenue *= 1 - top.share;
    // Retards de paiement : une part des encaissements glisse sur le mois suivant.
    const delayed = revenue * delayShare;
    revenue = revenue - delayed + carried;
    carried = delayed;
    let expenses = baseExpenses * share * (1 + (stress.expenseShock ?? 0));
    expenses *= 1 + (stress.fxShock ?? 0) * settings.fxShare;
    cash += revenue - expenses;
    forecast.push({ period, revenue: round(revenue), expenses: round(expenses), net: round(revenue - expenses), balance: round(cash) });
  }

  const lastPeriod = history.at(-1)?.period;
  const budget: BudgetRow[] = budgets.map((b) => {
    const catFlows = flows.filter((f) => f.amount < 0 && f.category.toLowerCase() === b.category.toLowerCase());
    const byMonth = sumBy(catFlows, (f) => month(f.date), (f) => -f.amount);
    const actual = lastPeriod ? byMonth.get(lastPeriod) ?? 0 : 0;
    const months = history.slice(-3).map((h) => byMonth.get(h.period) ?? 0);
    const average = months.length ? months.reduce((s, v) => s + v, 0) / months.length : 0;
    const variancePct = b.monthly ? Math.round(((actual - b.monthly) / b.monthly) * 1000) / 10 : null;
    return { category: b.category, budget: b.monthly, actual: round(actual), average: round(average), variancePct, status: variancePct === null ? "ok" : variancePct > 10 ? "depassement" : variancePct < -25 ? "sous_consomme" : "ok" };
  });

  const burn = Math.max(0, baseExpenses - recurringRevenue);
  const runwayMonths = burn > 0 ? Math.round((currentCash / burn) * 10) / 10 : null;
  const revenue12 = history.slice(-12).reduce((s, h) => s + h.revenue, 0);
  const expenses12 = history.slice(-12).reduce((s, h) => s + h.expenses, 0);

  const alerts: CashAlert[] = [];
  const negative = forecast.find((f) => f.balance < 0);
  const belowSafety = forecast.find((f) => f.balance < settings.safetyCash);
  if (currentCash < 0) alerts.push({ severity: "critique", title: "Trésorerie actuelle négative", detail: `Solde estimé : ${fmt(currentCash)} ${settings.currency}.` });
  if (negative) alerts.push({ severity: "critique", title: `Risque de rupture de trésorerie en ${negative.period}`, detail: `Solde projeté ${fmt(negative.balance)} ${settings.currency}. Actions : accélérer le recouvrement, reporter des dépenses, négocier une facilité de caisse ou lever des fonds.` });
  else if (belowSafety) alerts.push({ severity: "attention", title: `Trésorerie sous le seuil de sécurité en ${belowSafety.period}`, detail: `Solde projeté ${fmt(belowSafety.balance)} ${settings.currency} pour un seuil de ${fmt(settings.safetyCash)} ${settings.currency}.` });
  if (runwayMonths !== null && runwayMonths < 6) alerts.push({ severity: runwayMonths < 3 ? "critique" : "attention", title: `Autonomie financière : ${runwayMonths} mois`, detail: `Consommation nette moyenne ${fmt(burn)} ${settings.currency}/mois.` });
  for (const b of budget.filter((x) => x.status === "depassement")) alerts.push({ severity: (b.variancePct ?? 0) > 50 ? "critique" : "attention", title: `Dépassement de budget « ${b.category} » : +${b.variancePct} %`, detail: `${fmt(b.actual)} dépensés en ${lastPeriod} pour un budget mensuel de ${fmt(b.budget)}.` });

  const hypotheses = [
    basis === "journal_financier" ? "Flux issus du journal de trésorerie importé." : basis === "ventes_uniquement" ? "Aucun journal financier : seules les ventes sont prises en compte (dépenses inconnues)." : "Aucune donnée importée.",
    `Solde d'ouverture ${fmt(settings.openingCash)} ${settings.currency} au ${settings.openingDate}${settings.isExample ? " (valeur d'exemple, à remplacer)" : ""}.`,
    `Recettes projetées : moyenne des 3 derniers mois complets (${fmt(recurringRevenue)}) avec une tendance de ${(growth * 100).toFixed(1)} %/mois (bornée entre −15 % et +10 %).`,
    `Dépenses projetées : moyenne des 3 derniers mois complets (${fmt(baseExpenses)}).`,
    `Mois en cours (${startPeriod}) : projection limitée aux ${Math.round(remaining * daysInMonth)} jours restants.`,
  ];
  if (stress.revenueShock) hypotheses.push(`Choc sur les ventes : ${(stress.revenueShock * 100).toFixed(0)} %.`);
  if (stress.expenseShock) hypotheses.push(`Hausse des coûts : +${(stress.expenseShock * 100).toFixed(0)} %.`);
  if (stress.fxShock) hypotheses.push(`Choc de change : +${(stress.fxShock * 100).toFixed(0)} % sur la part des achats en devises (${Math.round(settings.fxShare * 100)} %).`);
  if (stress.paymentDelayDays) hypotheses.push(`Retards de paiement clients : +${stress.paymentDelayDays} jours.`);
  if (top) hypotheses.push(`Perte du premier client (${top.name}, ${Math.round(top.share * 100)} % des ventes).`);

  return {
    currency: settings.currency,
    isExample: settings.isExample || datasets.some((d) => d.isExample),
    hasData: flows.length > 0,
    basis,
    settings,
    currentCash: round(currentCash),
    history,
    forecast,
    budget,
    totals: { revenue12: round(revenue12), expenses12: round(expenses12), burnMonthly: round(burn), runwayMonths, growthPct: Math.round(rawGrowth * 1000) / 10 },
    hypotheses,
    alerts,
  };
}

/** Recettes récurrentes : on exclut les catégories d'apport/financement (apports, levées, emprunts, subventions). */
function avgRecurring(flows: Flow[], periods: string[]): number {
  if (!periods.length) return 0;
  const exclude = /(apport|capital|levee|levée|emprunt|pret|prêt|subvention|financement)/i;
  const total = flows.filter((f) => f.amount > 0 && periods.includes(f.date.slice(0, 7)) && !exclude.test(f.category)).reduce((s, f) => s + f.amount, 0);
  return total / periods.length;
}

/* ------------------------------------------------------------ Stress tests */

export const STRESS_SCENARIOS: { id: string; label: string; params: StressParams }[] = [
  { id: "ventes_-20", label: "Baisse des ventes de 20 %", params: { revenueShock: -0.2 } },
  { id: "change_+15", label: "Choc de change de 15 % sur les achats en devises", params: { fxShock: 0.15 } },
  { id: "retards_+30", label: "Retards de paiement clients de 30 jours", params: { paymentDelayDays: 30 } },
  { id: "perte_client", label: "Perte du premier client", params: { loseTopClient: true } },
  { id: "couts_+10", label: "Hausse des coûts de 10 %", params: { expenseShock: 0.1 } },
  { id: "combine", label: "Scénario combiné sévère", params: { revenueShock: -0.15, expenseShock: 0.1, fxShock: 0.15, paymentDelayDays: 30 } },
];

export type StressResult = { id: string; label: string; params: StressParams; minBalance: number; minPeriod: string; endBalance: number; deltaEnd: number; breach: string | null; severity: Severity };

export function stressTest(datasets: Dataset[], budgets: BudgetLine[], settings: FinanceSettings, now = new Date(), scenarios = STRESS_SCENARIOS): { base: FinanceView; results: StressResult[] } {
  const base = computeFinance(datasets, budgets, settings, now);
  const baseEnd = base.forecast.at(-1)?.balance ?? base.currentCash;
  const results = scenarios.map((s) => {
    const v = computeFinance(datasets, budgets, settings, now, s.params);
    const min = v.forecast.reduce((a, b) => (b.balance < a.balance ? b : a), v.forecast[0] ?? { period: "—", balance: v.currentCash });
    const breach = v.forecast.find((f) => f.balance < 0)?.period ?? null;
    const end = v.forecast.at(-1)?.balance ?? v.currentCash;
    return { id: s.id, label: s.label, params: s.params, minBalance: min.balance, minPeriod: min.period, endBalance: end, deltaEnd: end - baseEnd, breach, severity: (breach ? "critique" : min.balance < settings.safetyCash ? "attention" : "info") as Severity };
  });
  return { base, results };
}
