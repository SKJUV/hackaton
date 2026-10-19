import { assertCompanyAccess, assertObjectAccess } from "@/lib/workspace/access";
import { syncObligationReminders } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const companyId = s((await readJson(request)).companyId);
    await assertCompanyAccess(companyId, viewer);
    return syncObligationReminders(companyId);
  });
}
