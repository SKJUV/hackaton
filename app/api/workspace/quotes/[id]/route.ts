import { assertCompanyAccess, assertObjectAccess } from "@/lib/workspace/access";
import { decideQuote, followUpQuote, simulateQuoteResponse, WorkspaceError } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    await assertObjectAccess("quotes", id, viewer);
    const action = s((await readJson(request)).action);
    if (action === "simuler_reponse") return simulateQuoteResponse(id);
    if (action === "relancer") return followUpQuote(id, "utilisateur");
    if (action === "accepter") return decideQuote(id, "acceptee");
    if (action === "refuser") return decideQuote(id, "refusee");
    throw new WorkspaceError("Action inconnue.");
  });
}
