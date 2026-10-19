import { assertCompanyAccess, assertObjectAccess } from "@/lib/workspace/access";
import { toggleObligation } from "@/lib/workspace/service";
import { handlePaid, readJson } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePaid(async (viewer) => {
    await assertObjectAccess("obligations", id, viewer);
    return toggleObligation(id, Boolean((await readJson(request)).done));
  });
}
