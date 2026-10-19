import { assertCompanyAccess, handlePaid, readJson, s } from "@/lib/modules/http";
import { saveDocument } from "@/lib/workspace/service";
import { groundingMarkdown, groundQuery } from "@/lib/legal/grounding";
import { legalRefs } from "@/lib/modules/etat/legal";
import { ASSUMPTION_INFO, CATEGORIES, DEFAULT_ASSUMPTIONS, MEASURES, POLICY_LEGAL_QUERY, simulatePolicy, simulationMarkdown } from "@/lib/modules/etat/policy";
import { PROFILES } from "@/lib/modules/etat/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/** Catalogue des mesures et hypothèses par défaut. */
export async function GET() {
  return handlePaid(async () => ({ measures: MEASURES, categories: CATEGORIES, profiles: PROFILES.map((p) => ({ id: p.id, label: p.label })), assumptions: ASSUMPTION_INFO, defaults: DEFAULT_ASSUMPTIONS }));
}

/** Lance une simulation ; `enregistrer: true` + `companyId` l'enregistre dans Documents. */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const sim = simulatePolicy({ kind: s(b.kind), value: Number(b.value), target: s(b.target) || undefined, assumptions: (typeof b.assumptions === "object" && b.assumptions ? b.assumptions : {}) as Record<string, number> });
    const query = POLICY_LEGAL_QUERY[sim.measure.kind];
    let documentId: string | null = null;
    if (b.enregistrer === true) {
      const companyId = s(b.companyId);
      await assertCompanyAccess(companyId, viewer);
      const g = await groundQuery(query, 3);
      documentId = (await saveDocument(companyId, { title: `Simulation (démo) — ${sim.measure.label}`, kind: "note", content: simulationMarkdown(sim) + "\n" + groundingMarkdown(g), needsReview: true })).id;
    }
    return { ...sim, legal: await legalRefs(query), documentId };
  });
}
