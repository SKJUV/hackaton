/**
 * Indicateurs de SOLIDITÉ des fournisseurs de l'annuaire — DONNÉES SEED (exemple), non vérifiées.
 * En production, ces champs viendraient d'un registre officiel ou d'une centrale de bilans ; ici ils servent
 * uniquement à démontrer le calcul et sont toujours affichés avec le badge « Exemple ».
 */
export type Solidity = { yearsActive: number; references: number; incidents: number; financials: "solide" | "moyenne" | "fragile"; isExample: true };

export const SEED_SOLIDITY: Record<string, Solidity> = {
  sup_logi1: { yearsActive: 6, references: 25, incidents: 1, financials: "solide", isExample: true },
  sup_moto1: { yearsActive: 9, references: 40, incidents: 0, financials: "solide", isExample: true },
  sup_moto2: { yearsActive: 3, references: 8, incidents: 2, financials: "moyenne", isExample: true },
  sup_logi2: { yearsActive: 12, references: 30, incidents: 1, financials: "solide", isExample: true },
  sup_it1: { yearsActive: 5, references: 18, incidents: 0, financials: "solide", isExample: true },
  sup_it2: { yearsActive: 4, references: 10, incidents: 1, financials: "moyenne", isExample: true },
  sup_it3: { yearsActive: 2, references: 5, incidents: 3, financials: "fragile", isExample: true },
  sup_jur1: { yearsActive: 15, references: 60, incidents: 0, financials: "solide", isExample: true },
  sup_jur2: { yearsActive: 8, references: 35, incidents: 0, financials: "solide", isExample: true },
  sup_mkt1: { yearsActive: 4, references: 22, incidents: 1, financials: "moyenne", isExample: true },
  sup_imm1: { yearsActive: 3, references: 12, incidents: 0, financials: "moyenne", isExample: true },
  sup_fin1: { yearsActive: 10, references: 45, incidents: 1, financials: "solide", isExample: true },
  sup_ass1: { yearsActive: 20, references: 80, incidents: 0, financials: "solide", isExample: true },
  sup_emb1: { yearsActive: 2, references: 6, incidents: 2, financials: "fragile", isExample: true },
};

/** Valeur par défaut déterministe pour les fournisseurs ajoutés ensuite (toujours marquée exemple). */
export function solidityFor(id: string): Solidity {
  if (SEED_SOLIDITY[id]) return SEED_SOLIDITY[id];
  const h = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return { yearsActive: 1 + (h % 10), references: 3 + (h % 30), incidents: h % 3, financials: (["solide", "moyenne", "fragile"] as const)[h % 3], isExample: true };
}
