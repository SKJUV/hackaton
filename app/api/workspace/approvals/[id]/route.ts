import { assertApprover } from "@/lib/workspace/access";
import { decideApproval, WorkspaceError } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

/** Validation humaine d'une action externe (envoi d'email, demande de devis, relance). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const decision = s(b.decision);
    if (decision !== "approuver" && decision !== "rejeter") throw new WorkspaceError("Décision invalide.");
    const member = await assertApprover(id, s(b.memberId), viewer);
    if (member.role === "lecteur") throw new WorkspaceError("Les lecteurs ne peuvent pas valider d'actions externes.", 403);
    return decideApproval(id, decision, member.name, s(b.note) || undefined);
  });
}
