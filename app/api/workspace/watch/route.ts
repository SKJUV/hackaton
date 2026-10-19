import { regulatoryWatch } from "@/lib/compliance";
import { listOfficialDocuments } from "@/lib/legal/corpus";
import { getSnapshot } from "@/lib/workspace/service";
import { handlePaid } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handlePaid(async (viewer) => {
    const snap = await getSnapshot(new URL(request.url).searchParams.get("companyId") ?? undefined, viewer.email);
    return { keywords: snap.company.sectorKeywords, alerts: regulatoryWatch(snap.company.sectorKeywords, await listOfficialDocuments(), 12) };
  });
}
