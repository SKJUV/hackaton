import type { ModuleState, WorkspaceData } from "@/lib/workspace/types";

/**
 * Stockage des données d'un module dans le store JSON, sans toucher au type WorkspaceData.
 *
 *   const state = moduleState(data, "fund", seedFund);   // à appeler dans readData()/withData()
 *   state.applications.push(...)                          // dans withData() pour persister
 *
 * - `seed()` renvoie les collections de DÉMO (éléments marqués isExample / companyId d'une entreprise de démo).
 * - Chaque élément d'une collection DOIT porter `companyId` (contrôle d'accès + réinitialisation de la démo).
 * - « Réinitialiser la démo » garde les éléments des vraies entreprises et ré-applique le seed (voir resetModuleStates).
 */
export function moduleState<T extends Record<string, unknown[]>>(data: WorkspaceData, id: string, seed: () => T): T & ModuleState {
  data.modules ??= {};
  const current = (data.modules[id] ??= {}) as ModuleState;
  if (!current.__seeded) {
    const fresh = seed();
    for (const [key, value] of Object.entries(fresh)) {
      const existing = Array.isArray(current[key]) ? (current[key] as unknown[]) : [];
      const ids = new Set(existing.map((x) => (x as { id?: string }).id).filter(Boolean));
      current[key] = [...value.filter((x) => !ids.has((x as { id?: string }).id ?? "")), ...existing];
    }
    current.__seeded = true;
  }
  return current as T & ModuleState;
}

/** Filtre les éléments d'une collection pour une entreprise. */
export function forCompany<T extends { companyId: string }>(list: T[], companyId: string): T[] {
  return list.filter((x) => x.companyId === companyId);
}

/** Appelé par resetDemoData : conserve les vraies entreprises, efface la démo et redemande le seed. */
export function resetModuleStates(data: WorkspaceData, realCompanyIds: Set<string>) {
  for (const state of Object.values(data.modules ?? {})) {
    for (const [key, value] of Object.entries(state)) {
      if (!Array.isArray(value)) continue;
      state[key] = value.filter((x) => {
        const companyId = (x as { companyId?: string }).companyId;
        return companyId ? realCompanyIds.has(companyId) : false;
      });
    }
    state.__seeded = false;
  }
}
