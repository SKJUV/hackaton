import { resetData } from "@/lib/workspace/store";
import { handlePaid } from "@/lib/workspace/http";

export const runtime = "nodejs";

/** Réinitialise le workspace avec les données de démonstration. */
export async function POST() {
  return handlePaid(async () => {
    await resetData();
    return { ok: true };
  });
}
