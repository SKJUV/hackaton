import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { actorName, assertConnection } from "@/lib/modules/mcp/access";
import { deleteConnection, patchConnection } from "@/lib/modules/mcp/connectors";
import { publicConnection } from "@/lib/modules/mcp/repo";

export const runtime = "nodejs";

/** Activation par entreprise, renommage, jeton, politique par outil. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    await assertConnection(id, viewer, true);
    const b = await readJson(request);
    const overrides = b.toolOverrides && typeof b.toolOverrides === "object" ? (b.toolOverrides as Record<string, { enabled?: boolean; write?: boolean }>) : undefined;
    const conn = await patchConnection(id, { enabled: typeof b.enabled === "boolean" ? b.enabled : undefined, name: s(b.name) || undefined, bearer: s(b.bearer) || undefined, phoneNumberId: s(b.phoneNumberId) || undefined, toolOverrides: overrides }, actorName(viewer));
    return publicConnection(conn);
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    await assertConnection(id, viewer, true);
    return deleteConnection(id, actorName(viewer));
  });
}
