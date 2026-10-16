import { updateTaskStatus, WorkspaceError } from "@/lib/workspace/service";
import { handle, readJson, s } from "@/lib/workspace/http";
import type { TaskStatus } from "@/lib/workspace/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const status = s((await readJson(request)).status) as TaskStatus;
    if (!["a_faire", "en_cours", "fait"].includes(status)) throw new WorkspaceError("Statut invalide.");
    return updateTaskStatus(id, status);
  });
}
