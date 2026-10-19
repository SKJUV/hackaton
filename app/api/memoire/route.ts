import { assertCompanyAccess } from "@/lib/workspace/access";
import { handlePaid } from "@/lib/workspace/http";
import { memoireOverview } from "@/lib/modules/memoire/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vue d'ensemble du module mémoire (décisions, réunions, score, attestations). */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    await assertCompanyAccess(companyId, viewer);
    return memoireOverview(companyId);
  });
}
