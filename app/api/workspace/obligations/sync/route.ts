import { syncObligationReminders } from "@/lib/workspace/service";
import { handle, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handle(async () => syncObligationReminders(s((await readJson(request)).companyId)));
}
