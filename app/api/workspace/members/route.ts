import { assertCompanyAccess, assertObjectAccess } from "@/lib/workspace/access";
import { addMember } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import type { Role } from "@/lib/workspace/types";

export const runtime = "nodejs";
const roles: Role[] = ["proprietaire", "admin", "membre", "lecteur"];

export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    await assertCompanyAccess(s(b.companyId), viewer);
    const role = roles.includes(s(b.role) as Role) ? (s(b.role) as Role) : "membre";
    return addMember(s(b.companyId), { name: s(b.name), email: s(b.email), role });
  });
}
