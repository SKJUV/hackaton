import { getSnapshot } from "@/lib/workspace/service";
import { handle } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? undefined;
  return handle(() => getSnapshot(companyId));
}
