import { assertCompanyAccess, assertObjectAccess } from "@/lib/workspace/access";
import { updateTaskStatus, WorkspaceError } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import type { TaskStatus } from "@/lib/workspace/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    await assertObjectAccess("tasks", id, viewer);
    const status = s((await readJson(request)).status) as TaskStatus;
    if (!["a_faire", "en_cours", "fait"].includes(status)) throw new WorkspaceError("Statut invalide.");
    return updateTaskStatus(id, status);
  });
}
