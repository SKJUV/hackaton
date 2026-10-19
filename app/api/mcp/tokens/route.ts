import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { WorkspaceError } from "@/lib/workspace/service";
import { actorName, assertCompany } from "@/lib/modules/mcp/access";
import { createServerToken, listServerTokens, revokeServerToken, tokenCompany } from "@/lib/modules/mcp/server";

export const runtime = "nodejs";

/** Jetons du serveur MCP Co-founder (le jeton en clair n'est renvoyé qu'à la création). */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    await assertCompany(companyId, viewer, true);
    return { tokens: await listServerTokens(companyId) };
  });
}

export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompany(companyId, viewer, true);
    const scopes = Array.isArray(b.scopes) ? (b.scopes.map((x) => s(x)) as ("lecture" | "ecriture" | "approbation")[]) : undefined;
    return createServerToken(companyId, { name: s(b.name), scopes, memberId: s(b.memberId) || undefined }, actorName(viewer));
  });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return handlePaid(async (viewer) => {
    const companyId = await tokenCompany(id);
    if (!companyId) throw new WorkspaceError("Jeton introuvable.", 404);
    await assertCompany(companyId, viewer, true);
    return revokeServerToken(id, actorName(viewer));
  });
}
