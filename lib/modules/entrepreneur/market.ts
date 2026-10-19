/**
 * Marché B2B : place de marché construite sur l'annuaire fournisseurs existant, avec score de compatibilité
 * (besoin, ville, note) et de solidité (données SEED marquées exemple), et demandes de devis via le flux existant.
 */
import { readData } from "@/lib/workspace/store";
import { requestQuotes, WorkspaceError } from "@/lib/workspace/service";
import type { Supplier } from "@/lib/workspace/types";
import { basis, basisData } from "./grounding";
import { solidityFor, type Solidity } from "./market-seed";
import type { Ctx } from "./types";
import { hasKeyword, norm, words } from "./util";

const GENERIC = new Set(["pour", "avec", "dans", "besoin", "cherche", "fournisseur", "fournisseurs", "partenaire", "partenaires", "devis", "service", "services", "des", "une", "les"]);

export function solidityScore(s: Solidity) {
  const years = Math.min(30, s.yearsActive * 3);
  const refs = Math.min(30, Math.round(s.references * 0.75));
  const fin = { solide: 40, moyenne: 25, fragile: 5 }[s.financials];
  return Math.max(0, Math.min(100, years + refs + fin - s.incidents * 10));
}

export function compatibility(supplier: Supplier, need: string, city?: string) {
  const terms = words(need).filter((w) => w.length > 3 && !GENERIC.has(w));
  const hay = `${supplier.name} ${supplier.category} ${supplier.services.join(" ")} ${supplier.description}`;
  const matched = [...new Set(terms.filter((t) => hasKeyword(hay, t)))];
  const needScore = terms.length ? Math.round((60 * matched.length) / terms.length) : 30;
  const cityScore = city ? (norm(supplier.city) === norm(city) ? 15 : 0) : 8;
  const ratingScore = Math.round((supplier.rating / 5) * 25);
  return { score: Math.min(100, needScore + cityScore + ratingScore), matched, needMatched: matched.length > 0 || !terms.length };
}

export async function searchMarket(input: { need?: string; city?: string; category?: string; minSolidity?: number }, ctx?: Ctx) {
  const data = await readData();
  const need = input.need?.trim() ?? "";
  const rows = data.suppliers
    .filter((s) => !input.category || norm(s.category).includes(norm(input.category)))
    .map((s) => {
      const comp = compatibility(s, need, input.city);
      const sol = solidityFor(s.id);
      const solidity = solidityScore(sol);
      return { supplier: s, compatibility: comp.score, matched: comp.matched, needMatched: comp.needMatched, solidity, solidityData: sol, overall: Math.round(comp.score * 0.6 + solidity * 0.4) };
    })
    .filter((r) => r.needMatched && solidityOk(r.solidity, input.minSolidity))
    // Couverture du besoin d'abord (un partenaire qui couvre tout le besoin passe devant), puis score global.
    .sort((a, b) => b.matched.length - a.matched.length || b.overall - a.overall);
  const g = ctx ? await basis(ctx, `contrat fourniture vente ${need} obligations vendeur garantie consommateur`, 3) : null;
  return { rows, fondement_juridique: g ? basisData(g) : null, avertissement: "Indicateurs de solidité : données d'EXEMPLE (seed), non vérifiées — à remplacer par un registre officiel ou des états financiers." };
}

const solidityOk = (s: number, min?: number) => typeof min !== "number" || s >= min;

export async function requestMarketQuotes(companyId: string, input: { supplierIds: string[]; need: string; quantity?: string; desiredDate?: string }, ctx: Ctx, actor = "agent") {
  if (!input.supplierIds.length) throw new WorkspaceError("Choisissez au moins un partenaire.");
  const g = await basis(ctx, `contrat fourniture vente ${input.need} obligations vendeur garantie`, 3);
  const created = await requestQuotes(companyId, input, actor);
  return { created, fondement_juridique: basisData(g) };
}
