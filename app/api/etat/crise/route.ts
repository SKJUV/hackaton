import { handlePaid } from "@/lib/modules/http";
import { assessCrises, communicationPlan, COMMUNIQUE_QUERY, isCrisisType } from "@/lib/modules/etat/crisis";
import { legalRefs } from "@/lib/modules/etat/legal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Risques de crise + plan de communication (`?type=approvisionnement&profils=famille,artisan`). */
export async function GET(request: Request) {
  return handlePaid(async () => {
    const u = new URL(request.url);
    const t = u.searchParams.get("type");
    const profils = (u.searchParams.get("profils") || "").split(",").filter(Boolean);
    return {
      ...assessCrises(),
      plan: communicationPlan(isCrisisType(t) ? t : "approvisionnement", profils),
      legal: await legalRefs(COMMUNIQUE_QUERY),
    };
  });
}
