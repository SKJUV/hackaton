import type { EntrepriseStore } from "./types";

/** Conserve uniquement les données du module des entreprises indiquées (réinitialisation de la démo). Sans dépendance (importé par le store). */
export function pruneEntreprise(store: EntrepriseStore | undefined, keepCompanyIds: Set<string>): EntrepriseStore {
  const keep = <T extends { companyId: string }>(l: T[] | undefined) => (l ?? []).filter((x) => keepCompanyIds.has(x.companyId));
  return { datasets: keep(store?.datasets), budgets: keep(store?.budgets), settings: keep(store?.settings), counterparties: keep(store?.counterparties), reports: keep(store?.reports) };
}
