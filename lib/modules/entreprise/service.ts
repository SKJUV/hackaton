import { log, WorkspaceError } from "@/lib/workspace/service";
import { newId, nowIso, readData, withData } from "@/lib/workspace/store";
import type { Company, WorkspaceData } from "@/lib/workspace/types";
import { buildDashboards, detectAnomalies } from "./analytics";
import { parseCsv } from "./csv";
import { computeFinance } from "./finance";
import { seedBudgets, seedCounterparties, seedDatasets, seedSettings } from "./seed";
import { structureTable } from "./structure";
import type { BudgetLine, Counterparty, CounterpartyKind, Dataset, DatasetDomain, EntrepriseStore, FinanceSettings } from "./types";
import { readXlsx } from "./xlsx";

/**
 * Accès aux données du module entreprise.
 * - Entreprises de démonstration : seed « exemple » toujours présent (non persisté) + imports de l'utilisateur.
 * - Entreprises réelles : uniquement leurs imports (un jeu d'exemple peut être chargé explicitement, il reste marqué).
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 20000;
export const DOMAINS: DatasetDomain[] = ["ventes", "finances", "rh", "clients"];

export function emptyStore(): EntrepriseStore {
  return { datasets: [], budgets: [], settings: [], counterparties: [], reports: [] };
}

function storeOf(data: WorkspaceData): EntrepriseStore {
  const s = (data.entreprise ??= emptyStore());
  for (const k of Object.keys(emptyStore()) as (keyof EntrepriseStore)[]) (s[k] as unknown[]) ??= [];
  return s;
}

export type CompanyState = {
  company: Company;
  datasets: Dataset[];
  budgets: BudgetLine[];
  settings: FinanceSettings;
  counterparties: Counterparty[];
  reports: EntrepriseStore["reports"];
};

export function defaultSettings(company: Company, now = new Date()): FinanceSettings {
  return { companyId: company.id, openingCash: 0, openingDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1)).toISOString().slice(0, 10), safetyCash: 0, fxShare: 0, currency: company.currency || "XAF", isExample: false };
}

export function stateFrom(data: WorkspaceData, companyId: string, now = new Date()): CompanyState {
  const company = data.companies.find((c) => c.id === companyId);
  if (!company) throw new WorkspaceError("Entreprise introuvable.", 404);
  const s = data.entreprise ?? emptyStore();
  const mine = <T extends { companyId: string }>(list: T[] | undefined) => (list ?? []).filter((x) => x.companyId === companyId);
  const stored = { datasets: mine(s.datasets), budgets: mine(s.budgets), settings: mine(s.settings)[0], counterparties: mine(s.counterparties), reports: mine(s.reports) };
  const demo = Boolean(company.isExample);
  return {
    company,
    datasets: [...(demo ? seedDatasets(companyId, now) : []), ...stored.datasets],
    budgets: stored.budgets.length ? stored.budgets : demo ? seedBudgets(companyId) : [],
    settings: stored.settings ?? (demo ? seedSettings(companyId, now) : defaultSettings(company, now)),
    counterparties: [...(demo ? seedCounterparties(companyId) : []), ...stored.counterparties],
    reports: stored.reports.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function getState(companyId: string, now = new Date()): Promise<CompanyState> {
  return stateFrom(await readData(), companyId, now);
}

/* ------------------------------------------------------------------ Import */

export type ImportInput = { fileName: string; text?: string; base64?: string; domain?: DatasetDomain; name?: string; sheet?: string };

/** Lit un CSV ou un classeur .xlsx et le structure (une table par feuille non vide). */
export function parseUpload(input: ImportInput, companyId: string, now = new Date()): Dataset[] {
  const fileName = (input.fileName || "import").slice(0, 160);
  const ext = fileName.toLowerCase().split(".").pop();
  if (input.domain && !DOMAINS.includes(input.domain)) throw new WorkspaceError("Domaine inconnu (ventes, finances, rh, clients).");
  const make = (table: { headers: string[]; rows: string[][] }, kind: "csv" | "xlsx", sheet?: string) => {
    if (!table.headers.length || !table.rows.length) throw new WorkspaceError(`Fichier vide ou sans ligne de données${sheet ? ` (feuille « ${sheet} »)` : ""}.`);
    return structureTable(
      { headers: table.headers, rows: table.rows.slice(0, MAX_ROWS) },
      { companyId, id: newId("ds"), name: (input.name?.trim() || `${fileName.replace(/\.[^.]+$/, "")}${sheet ? ` — ${sheet}` : ""}`).slice(0, 120), fileName, kind, sheet, domain: input.domain, now: now.toISOString() },
    );
  };
  if (ext === "xlsx" || ext === "xlsm") {
    if (!input.base64) throw new WorkspaceError("Contenu Excel manquant.");
    const buf = Buffer.from(input.base64, "base64");
    if (buf.length > MAX_FILE_BYTES) throw new WorkspaceError("Fichier trop volumineux (5 Mo maximum).");
    let sheets;
    try {
      sheets = readXlsx(buf, MAX_ROWS);
    } catch (e) {
      throw new WorkspaceError(e instanceof Error ? e.message : "Classeur illisible.");
    }
    const useful = sheets.filter((s) => s.headers.length && s.rows.length && (!input.sheet || s.name === input.sheet));
    if (!useful.length) throw new WorkspaceError("Aucune feuille exploitable dans le classeur.");
    return useful.map((s) => make(s, "xlsx", sheets.length > 1 ? s.name : undefined));
  }
  if (ext === "xls") throw new WorkspaceError("Ancien format .xls non pris en charge : enregistrez le fichier en .xlsx ou .csv.");
  const text = input.text ?? (input.base64 ? Buffer.from(input.base64, "base64").toString("utf8") : "");
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new WorkspaceError("Fichier trop volumineux (5 Mo maximum).");
  if (!text.trim()) throw new WorkspaceError("Fichier vide.");
  return [make(parseCsv(text, MAX_ROWS), "csv")];
}

export async function importData(companyId: string, input: ImportInput, actor = "utilisateur", now = new Date()) {
  const datasets = parseUpload(input, companyId, now);
  await withData((data) => {
    if (!data.companies.some((c) => c.id === companyId)) throw new WorkspaceError("Entreprise introuvable.", 404);
    const s = storeOf(data);
    s.datasets.push(...datasets);
    log(data, companyId, actor, "donnees.import", `${datasets.length} table(s) importée(s) depuis « ${input.fileName} » : ${datasets.map((d) => `${d.name} (${d.domain}, ${d.rows.length} lignes)`).join(", ")}.`);
  });
  return datasets.map(summarizeDataset);
}

export async function loadExampleData(companyId: string, actor = "utilisateur", now = new Date()) {
  return withData((data) => {
    const company = data.companies.find((c) => c.id === companyId);
    if (!company) throw new WorkspaceError("Entreprise introuvable.", 404);
    if (company.isExample) throw new WorkspaceError("Les entreprises de démonstration contiennent déjà le jeu d'exemple.", 409);
    const s = storeOf(data);
    s.datasets = s.datasets.filter((d) => !(d.companyId === companyId && d.isExample));
    s.datasets.push(...seedDatasets("co_kmerlog", now).map((d) => ({ ...d, id: newId("ds"), companyId })));
    if (!s.budgets.some((b) => b.companyId === companyId)) s.budgets.push(...seedBudgets("co_kmerlog").map((b) => ({ ...b, id: newId("bud"), companyId })));
    if (!s.settings.some((x) => x.companyId === companyId)) s.settings.push({ ...seedSettings("co_kmerlog", now), companyId });
    log(data, companyId, actor, "donnees.exemple", "Jeu de données d'EXEMPLE chargé (fictif, marqué « exemple »).");
    return { ok: true };
  });
}

export async function deleteDataset(companyId: string, datasetId: string, actor = "utilisateur") {
  return withData((data) => {
    const s = storeOf(data);
    const ds = s.datasets.find((d) => d.id === datasetId && d.companyId === companyId);
    if (!ds) throw new WorkspaceError(datasetId.startsWith("ds_seed_") ? "Les données de démonstration ne peuvent pas être supprimées (réinitialisez la démo)." : "Table introuvable.", 404);
    s.datasets = s.datasets.filter((d) => d !== ds);
    log(data, companyId, actor, "donnees.suppression", `Table « ${ds.name} » supprimée.`);
    return { ok: true };
  });
}

export async function updateSettings(companyId: string, patch: Partial<Pick<FinanceSettings, "openingCash" | "openingDate" | "safetyCash" | "fxShare" | "currency">>, actor = "utilisateur") {
  return withData((data) => {
    const st = stateFrom(data, companyId);
    const next: FinanceSettings = { ...st.settings, isExample: false };
    if (patch.openingCash !== undefined) next.openingCash = Number(patch.openingCash) || 0;
    if (patch.safetyCash !== undefined) next.safetyCash = Math.max(0, Number(patch.safetyCash) || 0);
    if (patch.fxShare !== undefined) next.fxShare = Math.max(0, Math.min(1, Number(patch.fxShare) || 0));
    if (patch.openingDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.openingDate)) next.openingDate = patch.openingDate;
    if (patch.currency) next.currency = String(patch.currency).slice(0, 6).toUpperCase();
    const s = storeOf(data);
    s.settings = [...s.settings.filter((x) => x.companyId !== companyId), next];
    log(data, companyId, actor, "finance.parametres", "Paramètres de trésorerie mis à jour.");
    return next;
  });
}

export async function setBudget(companyId: string, lines: { category: string; monthly: number }[], actor = "utilisateur") {
  const clean = lines.filter((l) => l.category?.trim()).slice(0, 60).map((l) => ({ category: l.category.trim().slice(0, 80), monthly: Math.max(0, Number(l.monthly) || 0) }));
  return withData((data) => {
    stateFrom(data, companyId);
    const s = storeOf(data);
    s.budgets = [...s.budgets.filter((b) => b.companyId !== companyId), ...clean.map((l) => ({ id: newId("bud"), companyId, ...l, isExample: false }))];
    log(data, companyId, actor, "finance.budget", `Budget mis à jour (${clean.length} ligne(s)).`);
    return clean;
  });
}

export async function addCounterparty(companyId: string, input: { name: string; kind: CounterpartyKind; country?: string; city?: string; registration?: string; yearsActive?: number; notes?: string[] }, actor = "utilisateur") {
  if (!input.name?.trim()) throw new WorkspaceError("Nom requis.");
  if (!["partenaire", "fournisseur", "client", "investisseur"].includes(input.kind)) throw new WorkspaceError("Type inconnu (partenaire, fournisseur, client, investisseur).");
  return withData((data) => {
    stateFrom(data, companyId);
    const cp: Counterparty = { id: newId("cp"), companyId, name: input.name.trim().slice(0, 120), kind: input.kind, country: input.country?.trim() || "Cameroun", city: input.city?.trim() || undefined, registration: input.registration?.trim() || undefined, yearsActive: input.yearsActive !== undefined && Number.isFinite(Number(input.yearsActive)) ? Number(input.yearsActive) : undefined, notes: (input.notes ?? []).map((n) => n.trim()).filter(Boolean).slice(0, 20), isExample: false };
    storeOf(data).counterparties.push(cp);
    log(data, companyId, actor, "duediligence.ajout", `Contrepartie « ${cp.name} » (${cp.kind}) ajoutée.`);
    return cp;
  });
}

/* --------------------------------------------------------------- Lecture */

export const summarizeDataset = (d: Dataset) => ({
  id: d.id,
  name: d.name,
  domain: d.domain,
  source: d.source,
  rows: d.rows.length,
  headers: d.headers,
  mapping: d.mapping,
  warnings: d.warnings,
  importedAt: d.importedAt,
  isExample: d.isExample,
  preview: d.rows.slice(0, 5).map((r) => r.raw),
});

export async function dataOverview(companyId: string, now = new Date()) {
  const st = await getState(companyId, now);
  return {
    datasets: st.datasets.map(summarizeDataset),
    dashboards: buildDashboards(st.datasets, now),
    anomalies: detectAnomalies(st.datasets, now),
    reports: st.reports.map(({ markdown: _m, ...r }) => r),
    isExample: st.datasets.some((d) => d.isExample),
  };
}

export async function financeOverview(companyId: string, now = new Date()) {
  const st = await getState(companyId, now);
  return computeFinance(st.datasets, st.budgets, st.settings, now);
}

export { pruneEntreprise } from "./prune";
export { nowIso };
