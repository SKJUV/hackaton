import { assertCompanyAccess } from "@/lib/workspace/access";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { whatIMissed } from "@/lib/modules/memoire/meetings";

export const runtime = "nodejs";

/** « Ce que j'ai manqué » à l'échelle de l'entreprise depuis une date (et pour un membre). */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    return whatIMissed(companyId, { since: s(b.since) || undefined, memberId: s(b.memberId) || undefined });
  });
}
