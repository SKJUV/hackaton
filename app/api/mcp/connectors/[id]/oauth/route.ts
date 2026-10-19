import { baseUrlFrom } from "@/lib/auth/current";
import { handlePaid } from "@/lib/workspace/http";
import { actorName, assertConnection } from "@/lib/modules/mcp/access";
import { startOAuth } from "@/lib/modules/mcp/oauth-flow";

export const runtime = "nodejs";

/** Démarre l'autorisation OAuth (MCP standard ou fournisseur natif) ; renvoie l'URL d'autorisation. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    await assertConnection(id, viewer, true);
    return startOAuth(id, baseUrlFrom(request), actorName(viewer));
  });
}
