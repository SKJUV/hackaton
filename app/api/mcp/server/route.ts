import { handleMcpHttp } from "@/lib/modules/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Serveur MCP de Co-founder (Streamable HTTP, sans état).
 * URL : {APP_URL}/api/mcp/server — en-tête Authorization: Bearer cf_mcp_… (jeton par entreprise).
 */
export const POST = (request: Request) => handleMcpHttp(request);
export const GET = (request: Request) => handleMcpHttp(request);
export const DELETE = (request: Request) => handleMcpHttp(request);
