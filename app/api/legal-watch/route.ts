import { assertCompanyAccess, handlePaid, readJson, s, WorkspaceError } from "@/lib/modules/http";
import { ignoreLawChange, scanLawChanges, simulateLawChange, updateDocumentLegalBasis } from "@/lib/modules/law-watch/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Alerte de changement de loi : documents impactés par une modification du corpus officiel. */
export async function GET(request: Request) {
  return handlePaid(async (viewer) => {
    const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
    await assertCompanyAccess(companyId, viewer);
    return scanLawChanges(companyId);
  });
}

export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const action = s(b.action);
    if (action === "mettre_a_jour") return updateDocumentLegalBasis(companyId, s(b.documentId));
    if (action === "ignorer") return ignoreLawChange(companyId, s(b.documentId));
    if (action === "simuler") return simulateLawChange(companyId);
    throw new WorkspaceError("Action inconnue.");
  });
}
