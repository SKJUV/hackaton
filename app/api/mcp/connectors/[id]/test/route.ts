import { handlePaid } from "@/lib/workspace/http";
import { actorName, assertConnection } from "@/lib/modules/mcp/access";
import { testConnection } from "@/lib/modules/mcp/connectors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Test de connexion + découverte (rafraîchit la liste des outils). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    await assertConnection(id, viewer);
    return testConnection(id, actorName(viewer));
  });
}
