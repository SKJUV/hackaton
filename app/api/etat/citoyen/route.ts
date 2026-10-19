import { handlePaid } from "@/lib/modules/http";
import { citizenAdvice } from "@/lib/modules/etat/citizen";
import { legalRefs } from "@/lib/modules/etat/legal";
import { NEWS, PROFILES } from "@/lib/modules/etat/seed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Conseils pratiques par profil (`?profil=agriculteur&actualites=actu-inflation`). */
export async function GET(request: Request) {
  return handlePaid(async () => {
    const u = new URL(request.url);
    const adv = citizenAdvice(u.searchParams.get("profil") || "famille", (u.searchParams.get("actualites") || "").split(",").filter(Boolean));
    return { ...adv, legal: await legalRefs(adv.legalQuery), catalog: { profiles: PROFILES.map((p) => ({ id: p.id, label: p.label })), news: NEWS.map((n) => ({ id: n.id, title: n.title })) } };
  });
}
