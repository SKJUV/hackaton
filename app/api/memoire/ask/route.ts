import { assertCompanyAccess } from "@/lib/workspace/access";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { askMemory } from "@/lib/modules/memoire/memory";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Questions-réponses sur la mémoire organisationnelle. */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    return askMemory(companyId, s(b.question).slice(0, 1000));
  });
}
