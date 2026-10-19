import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { actorName, assertConnection } from "@/lib/modules/mcp/access";
import { invokeConnectorTool } from "@/lib/modules/mcp/connectors";

export const runtime = "nodejs";
export const maxDuration = 90;

/** Appel manuel d'un outil : lecture immédiate, écriture → file d'approbation. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    const conn = await assertConnection(id, viewer, true);
    const b = await readJson(request);
    const args = b.args && typeof b.args === "object" && !Array.isArray(b.args) ? (b.args as Record<string, unknown>) : {};
    return invokeConnectorTool(conn.companyId, id, s(b.tool), args, actorName(viewer));
  });
}
