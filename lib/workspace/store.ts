import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSeed } from "./seed";
import type { WorkspaceData } from "./types";

/**
 * Persistance fichier JSON (zéro dépendance) derrière une API transactionnelle.
 * Remplaçable par Postgres/SQLite : seules `readData`/`withData` sont utilisées par les services.
 */
export const DATA_VERSION = 2;

function dbPath(): string {
  return process.env.WORKSPACE_DB_PATH || path.join(process.cwd(), "data", "workspace.db.json");
}

let cache: { path: string; data: WorkspaceData } | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<WorkspaceData> {
  const file = dbPath();
  if (cache && cache.path === file) return cache.data;
  let data: WorkspaceData;
  try {
    data = migrate(JSON.parse(await readFile(file, "utf8")) as WorkspaceData);
  } catch {
    data = buildSeed();
    await persist(file, data);
  }
  cache = { path: file, data };
  return data;
}

/** Migrations non destructives : on conserve les données existantes. */
function migrate(data: WorkspaceData): WorkspaceData {
  if (!data || typeof data !== "object" || !Array.isArray(data.companies)) throw new Error("format");
  if (data.version < 2) {
    const seed = buildSeed();
    data.users = seed.users;
    data.loginCodes = [];
    data.systemEmails = [];
    data.subscriptions = seed.subscriptions;
    data.version = 2;
  }
  if (data.version !== DATA_VERSION) throw new Error("version");
  return data;
}

async function persist(file: string, data: WorkspaceData) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, file);
}

/** Lecture seule (copie profonde pour éviter les mutations accidentelles). */
export async function readData(): Promise<WorkspaceData> {
  await queue;
  return structuredClone(await load());
}

/** Exécute une mutation sérialisée puis persiste le résultat. */
export function withData<T>(mutator: (data: WorkspaceData) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const data = await load();
    const result = await mutator(data);
    await persist(dbPath(), data);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Réinitialise le workspace avec le seed de démonstration. */
export function resetData(): Promise<void> {
  return withData((data) => {
    const fresh = buildSeed();
    Object.assign(data, fresh);
  });
}

const COMPANY_SCOPED = ["members", "documents", "tasks", "quotes", "emails", "approvals", "activity", "checklist", "obligations", "messages"] as const;

/**
 * Réinitialise uniquement les données de DÉMONSTRATION : les entreprises réelles des utilisateurs,
 * leurs comptes, abonnements et historiques sont conservés.
 */
export function resetDemoData(): Promise<void> {
  return withData((data) => {
    const fresh = buildSeed();
    const realIds = new Set(data.companies.filter((c) => !c.isExample).map((c) => c.id));
    const keep = <T extends { companyId: string }>(list: T[]) => list.filter((x) => realIds.has(x.companyId));
    data.companies = [...fresh.companies, ...data.companies.filter((c) => realIds.has(c.id))];
    for (const key of COMPANY_SCOPED) {
      (data as Record<string, unknown>)[key] = [...(fresh[key] as { companyId: string }[]), ...keep(data[key] as { companyId: string }[])];
    }
    data.suppliers = fresh.suppliers;
    const seedUserIds = new Set(fresh.users.map((u) => u.id));
    data.users = [...fresh.users, ...data.users.filter((u) => !seedUserIds.has(u.id))];
    const seedSubIds = new Set(fresh.subscriptions.map((x) => x.id));
    data.subscriptions = [...fresh.subscriptions, ...data.subscriptions.filter((x) => !seedSubIds.has(x.id) && !seedUserIds.has(x.userId))];
  });
}

/** Réservé aux tests. */
export function __clearCache() {
  cache = null;
  queue = Promise.resolve();
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
