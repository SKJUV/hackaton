import { handlePaid } from "@/lib/workspace/http";
import { assertCompany } from "@/lib/modules/mcp/access";
import { listCalls } from "@/lib/modules/mcp/connectors";

export const runtime = "nodejs";

/** Journal des appels de connecteurs (arguments sensibles masqués). */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    await assertCompany(companyId, viewer);
    return { calls: await listCalls(companyId) };
  });
}
