import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { updateDecision } from "@/lib/modules/memoire/memory";
import { actorName } from "@/lib/modules/memoire/overview";
import { assertMemoireAccess } from "@/lib/modules/memoire/store";
import type { DecisionStatus } from "@/lib/modules/memoire/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    const companyId = await assertMemoireAccess("decisions", id, viewer);
    const b = await readJson(request);
    return updateDecision(id, { status: (s(b.status) || undefined) as DecisionStatus | undefined, note: s(b.note) }, await actorName(companyId, s(b.memberId)));
  });
}
