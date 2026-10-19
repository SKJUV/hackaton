import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { actorName, assertCompany } from "@/lib/modules/mcp/access";
import { listInbox, syncInbox } from "@/lib/modules/mcp/inbox";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Boîte unifiée classée et priorisée. */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    await assertCompany(companyId, viewer);
    return listInbox(companyId);
  });
}

/** Synchronisation depuis les connecteurs Gmail / Outlook réels. */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompany(companyId, viewer);
    return syncInbox(companyId, actorName(viewer));
  });
}
