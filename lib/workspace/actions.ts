import { attachLegalCheck } from "./legal-check";
import { createEmailWithApproval, log, WorkspaceError } from "./service";
import { withData } from "./store";
import type { Approval, Email } from "./types";

/**
 * POINT D'ENTRÉE UNIQUE des actions externes pour les modules (emails, WhatsApp/SMS en démo, candidatures,
 * relances, mises en relation…). L'action est placée dans la file d'approbation ; rien ne part sans validation humaine.
 * Le feu vert juridique (articles du corpus) est calculé puis affiché dans la carte d'approbation.
 *
 *   await proposeExternalMessage(companyId, {
 *     module: "fund", type: "fund_relance", title: "Relancer le programme X", summary: "…",
 *     channel: "email", to: ["contact@programme.example.com"], subject: "…", body: "…",
 *     legalQuery: "subvention aide publique obligations bénéficiaire",   // facultatif (défaut : objet + corps)
 *   });
 */
export async function proposeExternalMessage(
  companyId: string,
  input: {
    module: string;
    type: string;
    title: string;
    summary: string;
    to: string[];
    subject: string;
    body: string;
    cc?: string[];
    channel?: Email["channel"];
    relatedType?: string;
    relatedId?: string;
    legalQuery?: string;
  },
  actor = "agent",
): Promise<{ email: Email; approval: Approval }> {
  if (!input.module?.trim()) throw new WorkspaceError("Module requis.");
  const res = await withData((data) => {
    if (!data.companies.some((c) => c.id === companyId)) throw new WorkspaceError("Entreprise introuvable.", 404);
    const created = createEmailWithApproval(
      data,
      companyId,
      { to: input.to, cc: input.cc, subject: input.subject, body: input.body, channel: input.channel, relatedType: input.relatedType, relatedId: input.relatedId },
      { type: input.type, title: input.title, summary: input.summary, module: input.module },
      actor,
    );
    log(data, companyId, actor, `${input.module}.action_externe`, `${input.title} — en attente d'approbation.`);
    return created;
  });
  const check = await attachLegalCheck([res.approval.id], input.legalQuery ?? `${input.subject} ${input.body}`);
  return { email: res.email, approval: { ...res.approval, legalCheck: check ?? undefined } };
}
