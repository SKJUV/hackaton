import { baseUrlFrom } from "@/lib/auth/current";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { actorName, assertCompany } from "@/lib/modules/mcp/access";
import { CATALOG, catalogStatus } from "@/lib/modules/mcp/catalog";
import { connectorSendMode, oauthRedirectUri, stdioAllowed } from "@/lib/modules/mcp/config";
import { createConnection, type CreateInput } from "@/lib/modules/mcp/connectors";
import { keyStatus } from "@/lib/modules/mcp/crypto";
import { publicConnection, readMcp } from "@/lib/modules/mcp/repo";

export const runtime = "nodejs";

/** Catalogue + connecteurs de l'entreprise (aucun secret renvoyé). */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    await assertCompany(companyId, viewer);
    const { mcp } = await readMcp();
    return {
      catalog: CATALOG.map(catalogStatus),
      connections: mcp.connections.filter((c) => c.companyId === companyId).map(publicConnection),
      settings: { encryption: keyStatus(), sendMode: connectorSendMode(), redirectUri: oauthRedirectUri(baseUrlFrom(request)), stdio: stdioAllowed(), mcpServerUrl: `${baseUrlFrom(request)}/api/mcp/server` },
    };
  });
}

export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompany(companyId, viewer, true);
    const stdio = b.stdio && typeof b.stdio === "object" ? (b.stdio as { command?: unknown; args?: unknown }) : undefined;
    const input: CreateInput = {
      catalogId: s(b.catalogId) || undefined,
      name: s(b.name) || undefined,
      url: s(b.url) || undefined,
      transport: (s(b.transport) || undefined) as CreateInput["transport"],
      authMode: (s(b.authMode) || undefined) as CreateInput["authMode"],
      bearer: s(b.bearer) || undefined,
      demo: b.demo === true,
      useEnvToken: b.useEnvToken === true,
      config: b.config && typeof b.config === "object" ? Object.fromEntries(Object.entries(b.config as Record<string, unknown>).map(([k, v]) => [k, s(v)])) : undefined,
      stdio: stdio ? { command: s(stdio.command), args: Array.isArray(stdio.args) ? stdio.args.map((a) => s(a)) : [] } : undefined,
    };
    return publicConnection(await createConnection(companyId, input, actorName(viewer)));
  });
}
