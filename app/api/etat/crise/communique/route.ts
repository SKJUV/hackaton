import { assertCompanyAccess, handlePaid, proposeExternalMessage, readJson, s } from "@/lib/modules/http";
import { saveDocument } from "@/lib/workspace/service";
import { groundingMarkdown, groundQuery } from "@/lib/legal/grounding";
import { communicationPlan, COMMUNIQUE_QUERY, communiqueMarkdown, isCrisisType } from "@/lib/modules/etat/crisis";
import { DEMO_BANNER } from "@/lib/modules/etat/seed";

export const runtime = "nodejs";

/** Enregistre un projet de communiqué (à valider) ; avec des destinataires, prépare un email soumis à approbation. */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const type = isCrisisType(b.type) ? b.type : "approvisionnement";
    const profile = s(b.profil) || undefined;
    const plan = communicationPlan(type, profile ? [profile] : undefined);
    const g = await groundQuery(COMMUNIQUE_QUERY, 3);
    const content = communiqueMarkdown(plan, profile) + "\n" + groundingMarkdown(g);
    const title = `Communiqué citoyen (démo) — ${plan.crisisLabel}${profile && plan.segments[0] ? ` — ${plan.segments[0].label}` : ""}`;
    const doc = await saveDocument(companyId, { title, kind: "note", content, needsReview: true }, "utilisateur");
    const to = (Array.isArray(b.destinataires) ? b.destinataires : s(b.destinataires).split(/[,;\s]+/)).filter((x): x is string => typeof x === "string" && x.includes("@"));
    const approval = to.length
      ? (
          await proposeExternalMessage(
            companyId,
            { module: "etat", type: "etat_communique", title: `Transmettre le projet de communiqué « ${plan.crisisLabel} » (démo)`, summary: `À : ${to.join(", ")} — projet à valider, aucune diffusion au public`, channel: "email", to, subject: `[${DEMO_BANNER}] Projet de ${title}`, body: `Bonjour,\n\nProjet de communiqué à valider avant toute diffusion :\n\n${content}\n\nCordialement`, relatedType: "document", relatedId: doc.id, legalQuery: COMMUNIQUE_QUERY },
            "utilisateur",
          )
        ).approval
      : null;
    return { document: { id: doc.id, title: doc.title }, approvalId: approval?.id ?? null };
  });
}
