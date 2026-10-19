import { assertCompanyAccess } from "@/lib/workspace/access";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { listDecisions, recordDecision } from "@/lib/modules/memoire/memory";
import { actorName } from "@/lib/modules/memoire/overview";
import type { DecisionStatus, SourceRef } from "@/lib/modules/memoire/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    await assertCompanyAccess(companyId, viewer);
    return listDecisions(companyId, { status: url.searchParams.get("statut") ?? undefined, q: url.searchParams.get("q") ?? undefined });
  });
}

const TYPES = new Set(["document", "email", "reunion", "journal", "message", "decision", "tache"]);

/** Enregistre une décision au registre ; les articles trouvés dans le corpus sont figés avec elle. */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const sources = (Array.isArray(b.sources) ? b.sources : [])
      .filter((x): x is SourceRef => typeof x === "object" && x !== null && TYPES.has(s((x as SourceRef).type)) && Boolean(s((x as SourceRef).id)))
      .map((x) => ({ type: x.type, id: s(x.id).slice(0, 80), label: s(x.label).slice(0, 200) || x.type }));
    const actor = await actorName(companyId, s(b.memberId));
    return recordDecision(
      companyId,
      {
        title: s(b.title),
        decision: s(b.decision) || s(b.title),
        rationale: s(b.rationale),
        alternatives: Array.isArray(b.alternatives) ? b.alternatives.map(s) : s(b.alternatives).split("\n"),
        status: (["proposee", "adoptee", "revisee", "abandonnee"].includes(s(b.status)) ? s(b.status) : "adoptee") as DecisionStatus,
        decidedBy: actor,
        sources,
      },
      actor,
    );
  });
}
