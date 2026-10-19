import { groundingLabel, groundQuery } from "@/lib/legal/grounding";
import { log } from "./service";
import { withData, nowIso } from "./store";
import type { LegalCheck } from "./types";

/**
 * FEU VERT JURIDIQUE — avant toute action externe (email, devis, relance, message, candidature…),
 * on vérifie l'action contre le corpus officiel et on affiche les articles dans la carte d'approbation.
 * Ne bloque jamais l'action : l'humain décide, informé.
 */
export async function computeLegalCheck(query: string): Promise<LegalCheck> {
  const g = await groundQuery(query.replace(/\s+/g, " ").slice(0, 400), 3);
  return {
    status: g.status,
    label: groundingLabel(g),
    query: g.query,
    sources: g.sources.slice(0, 3),
    checkedAt: nowIso(),
  };
}

/** Calcule le feu vert et l'attache aux approbations données. Ne lève jamais (le contrôle est informatif). */
export async function attachLegalCheck(approvalIds: string[], query: string): Promise<LegalCheck | null> {
  if (!approvalIds.length) return null;
  try {
    const check = await computeLegalCheck(query);
    await withData((data) => {
      for (const approval of data.approvals.filter((a) => approvalIds.includes(a.id))) {
        approval.legalCheck = check;
        log(data, approval.companyId, "system", "feu_vert.juridique", `${approval.title} — ${check.label}.`);
      }
    });
    return check;
  } catch (error) {
    console.error("feu vert juridique", error);
    return null;
  }
}
