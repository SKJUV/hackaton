import { updateChecklistStep, WorkspaceError } from "@/lib/workspace/service";
import { handle, readJson, s } from "@/lib/workspace/http";
import type { StepStatus } from "@/lib/workspace/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const b = await readJson(request);
    const status = s(b.status) as StepStatus;
    if (!["a_faire", "en_cours", "fait", "bloque"].includes(status)) throw new WorkspaceError("Statut invalide.");
    return updateChecklistStep(id, status, typeof b.note === "string" ? b.note : undefined);
  });
}
