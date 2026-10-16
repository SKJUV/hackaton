import { resetDemoData } from "@/lib/workspace/store";
import { handlePaid } from "@/lib/workspace/http";

export const runtime = "nodejs";

/** Réinitialise les données de démonstration (les entreprises réelles et les comptes sont conservés). */
export async function POST() {
  return handlePaid(async () => {
    await resetDemoData();
    return { ok: true };
  });
}
