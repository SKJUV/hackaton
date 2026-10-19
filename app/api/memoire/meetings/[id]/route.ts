import { WorkspaceError } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { analyzeMeeting, appendToMeeting, savePvDocument, whatIMissed } from "@/lib/modules/memoire/meetings";
import { actorName } from "@/lib/modules/memoire/overview";
import { assertMemoireAccess } from "@/lib/modules/memoire/store";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Ajout en direct à la transcription (dictée, notes). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    await assertMemoireAccess("meetings", id, viewer);
    const b = await readJson(request);
    return appendToMeeting(id, s(b.text).slice(0, 10_000), s(b.speaker).slice(0, 60) || undefined);
  });
}

/** Actions : apercu | cloturer | manque | pv. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    const companyId = await assertMemoireAccess("meetings", id, viewer);
    const b = await readJson(request);
    const actor = await actorName(companyId, s(b.memberId));
    switch (s(b.action)) {
      case "apercu":
        return analyzeMeeting(id, { finalize: false }, actor);
      case "cloturer":
        return analyzeMeeting(id, { finalize: true }, actor);
      case "manque":
        return whatIMissed(companyId, { meetingId: id, since: s(b.since) });
      case "pv":
        return savePvDocument(id, actor);
      default:
        throw new WorkspaceError("Action inconnue (apercu, cloturer, manque, pv).");
    }
  });
}
