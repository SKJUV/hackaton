import { readData } from "@/lib/workspace/store";
import { decideApproval, WorkspaceError } from "@/lib/workspace/service";
import { handle, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

/** Validation humaine d'une action externe (envoi d'email, demande de devis, relance). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const b = await readJson(request);
    const decision = s(b.decision);
    if (decision !== "approuver" && decision !== "rejeter") throw new WorkspaceError("Décision invalide.");
    const data = await readData();
    const member = data.members.find((m) => m.id === s(b.memberId));
    if (!member) throw new WorkspaceError("Membre inconnu : sélectionnez votre profil.", 403);
    if (member.role === "lecteur") throw new WorkspaceError("Les lecteurs ne peuvent pas valider d'actions externes.", 403);
    return decideApproval(id, decision, member.name, s(b.note) || undefined);
  });
}
