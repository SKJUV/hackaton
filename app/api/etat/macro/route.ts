import { handlePaid } from "@/lib/modules/http";
import { buildMacroDashboard, TENSION_FORMULA } from "@/lib/modules/etat/macro";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tableau de bord macro (démo) ; `?reel=1` ajoute la couche réelle Banque mondiale, `?pays=CMR`, `?region=littoral`. */
export async function GET(request: Request) {
  return handlePaid(async () => {
    const u = new URL(request.url);
    const d = await buildMacroDashboard({ region: u.searchParams.get("region") || undefined, includeReal: u.searchParams.get("reel") === "1", country: u.searchParams.get("pays") || undefined });
    return { ...d, tensionFormula: TENSION_FORMULA };
  });
}
