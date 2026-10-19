import { moduleState } from "@/lib/modules/state";
import { WorkspaceError } from "@/lib/workspace/service";
import { readData, withData } from "@/lib/workspace/store";
import type { WorkspaceData } from "@/lib/workspace/types";
import { seedEntrepreneur } from "./seed";
import type { EntrepreneurData } from "./types";

/** Clé d'état du module (data.modules.entrepreneur) — convention moduleState, aucune modification de WorkspaceData. */
export const STATE_ID = "entrepreneur";

export function moduleOf(data: WorkspaceData): EntrepreneurData {
  return moduleState(data, STATE_ID, seedEntrepreneur) as unknown as EntrepreneurData;
}

export function requireCompanyIn(data: WorkspaceData, companyId: string) {
  const company = data.companies.find((c) => c.id === companyId);
  if (!company) throw new WorkspaceError("Entreprise introuvable.", 404);
  return company;
}

export async function readModule(companyId: string) {
  const data = await readData();
  const company = requireCompanyIn(data, companyId);
  return { data, m: moduleOf(data), company };
}

export function withModule<T>(companyId: string, fn: (m: EntrepreneurData, data: WorkspaceData) => T | Promise<T>) {
  return withData((data) => {
    requireCompanyIn(data, companyId);
    return fn(moduleOf(data), data);
  });
}
