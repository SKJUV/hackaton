import { assertCompanyAccess, assertObjectAccess } from "@/lib/workspace/access";
import { requestQuotes } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    await assertCompanyAccess(s(b.companyId), viewer);
    const ids = Array.isArray(b.supplierIds) ? b.supplierIds.filter((x): x is string => typeof x === "string") : [];
    return requestQuotes(s(b.companyId), { supplierIds: ids, need: s(b.need), quantity: s(b.quantity) || undefined, desiredDate: s(b.desiredDate) || undefined }, "utilisateur");
  });
}
