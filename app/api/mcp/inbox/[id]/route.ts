import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { WorkspaceError } from "@/lib/workspace/service";
import { actorName, assertCompany } from "@/lib/modules/mcp/access";
import { inboxMessageCompany, prepareReply, ROUTINE_LABELS, setInboxStatus } from "@/lib/modules/mcp/inbox";
import type { RoutineKind } from "@/lib/modules/mcp/types";

export const runtime = "nodejs";

/** Actions sur un message : répondre / action routinière (→ approbation) ou changer le statut. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    const companyId = await inboxMessageCompany(id);
    if (!companyId) throw new WorkspaceError("Message introuvable.", 404);
    await assertCompany(companyId, viewer, true);
    const b = await readJson(request);
    const action = s(b.action);
    if (action === "statut") {
      const status = s(b.status);
      if (!["nouveau", "traite", "archive"].includes(status)) throw new WorkspaceError("Statut invalide.");
      return setInboxStatus(id, status as "nouveau" | "traite" | "archive");
    }
    if (action === "repondre" || action === "routine") {
      const routine = s(b.routine) in ROUTINE_LABELS ? (s(b.routine) as RoutineKind) : undefined;
      return prepareReply(id, { corps: s(b.corps) || undefined, routine }, actorName(viewer));
    }
    throw new WorkspaceError("Action inconnue.");
  });
}
