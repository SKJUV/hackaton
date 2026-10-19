import { searchLegalCorpus } from "@/lib/legal/corpus";
import { assessCoverage, groundingLabel, toSource } from "@/lib/legal/grounding";
import { WorkspaceError } from "@/lib/workspace/service";
import { handle } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recherche directe dans le corpus (sans LLM) : extraits, citations et statut de couverture. Gratuit. */
export async function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    const q = params.get("q")?.trim() ?? "";
    if (q.length < 3) throw new WorkspaceError("Requête trop courte.");
    const limit = Math.min(Math.max(Number(params.get("limit")) || 8, 1), 10);
    const search = await searchLegalCorpus(q, limit);
    const coverage = assessCoverage(q, search.citations.filter((c) => !c.isExample).map((c) => c.excerpt));
    const sources = search.citations.map(toSource);
    return { ...search, grounding: { ...coverage, label: groundingLabel({ status: coverage.status, sources }) } };
  });
}
