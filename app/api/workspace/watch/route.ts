import { regulatoryWatch } from "@/lib/compliance";
import { listOfficialDocuments } from "@/lib/legal/corpus";
import { getSnapshot } from "@/lib/workspace/service";
import { handle } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    const snap = await getSnapshot(new URL(request.url).searchParams.get("companyId") ?? undefined);
    return { keywords: snap.company.sectorKeywords, alerts: regulatoryWatch(snap.company.sectorKeywords, await listOfficialDocuments(), 12) };
  });
}
