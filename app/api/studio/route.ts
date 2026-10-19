import { handlePaid } from "@/lib/workspace/http";
import { studioStatus } from "@/lib/studio/registry";

export const dynamic = "force-dynamic";

/** Statut des modules ai-cofounder-studio (réservé à l'offre payante). */
export async function GET() {
  return handlePaid(async () => studioStatus());
}
