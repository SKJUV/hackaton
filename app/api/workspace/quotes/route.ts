import { requestQuotes } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePaid(async () => {
    const b = await readJson(request);
    const ids = Array.isArray(b.supplierIds) ? b.supplierIds.filter((x): x is string => typeof x === "string") : [];
    return requestQuotes(s(b.companyId), { supplierIds: ids, need: s(b.need), quantity: s(b.quantity) || undefined, desiredDate: s(b.desiredDate) || undefined }, "utilisateur");
  });
}
