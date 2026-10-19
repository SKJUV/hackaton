import { assertCompanyAccess, handlePaid } from "@/lib/modules/http";
import { entrepreneurSnapshot } from "@/lib/modules/entrepreneur/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Instantané du module Entrepreneur (offre payante, comme le reste de l'assistant). */
export async function GET(request: Request) {
  return handlePaid(async (viewer) => {
    const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
    await assertCompanyAccess(companyId, viewer);
    return entrepreneurSnapshot(companyId);
  });
}
