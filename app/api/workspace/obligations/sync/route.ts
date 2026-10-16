import { syncObligationReminders } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePaid(async () => syncObligationReminders(s((await readJson(request)).companyId)));
}
