import { assertCompanyAccess, handlePaid, readJson, s } from "@/lib/modules/http";
import { runEntrepreneurAction } from "@/lib/modules/entrepreneur/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Exécute une action du module (même code que l'outil de l'agent). Corps : { companyId, ...paramètres de l'outil }. */
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return handlePaid(async (viewer) => {
    const { action } = await params;
    const body = await readJson(request);
    const companyId = s(body.companyId);
    await assertCompanyAccess(companyId, viewer);
    const { companyId: _c, ...input } = body;
    void _c;
    return runEntrepreneurAction(action, companyId, input, { actor: "utilisateur", viewerEmail: viewer.email });
  });
}
