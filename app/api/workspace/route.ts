import { currentUser } from "@/lib/auth/current";
import { getSnapshot } from "@/lib/workspace/service";
import { handlePaid } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? undefined;
  return handlePaid(async () => getSnapshot(companyId, (await currentUser())?.email ?? undefined));
}
