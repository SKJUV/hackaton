import { NextResponse } from "next/server";
import { baseUrlFrom, currentUser } from "@/lib/auth/current";
import { canAccessCompany } from "@/lib/workspace/access";
import { readData } from "@/lib/workspace/store";
import { finishOAuth } from "@/lib/modules/mcp/oauth-flow";

export const runtime = "nodejs";

/** URI de redirection OAuth UNIQUE : {APP_URL}/api/mcp/oauth/callback */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(`${baseUrlFrom(request)}/workspace?onglet=connecteurs&${q}`, 302);
  try {
    const user = await currentUser();
    const data = await readData();
    const r = await finishOAuth(url.searchParams.get("state") ?? "", url.searchParams.get("code"), url.searchParams.get("error"), (companyId) => canAccessCompany(data, companyId, user?.email ?? null));
    return back(`oauth=${r.ok ? "ok" : "test_echoue"}&connecteur=${encodeURIComponent(r.connectionId)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur OAuth";
    return back(`oauth=erreur&message=${encodeURIComponent(message.slice(0, 160))}`);
  }
}
