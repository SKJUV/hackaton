import type { AgentModule } from "@/lib/agent/registry";
import { scanLawChanges, updateDocumentLegalBasis } from "./service";

export const agentModule: AgentModule = {
  id: "law-watch",
  tools: [
    {
      name: "loi_verifier_changements",
      description: "Alerte de changement de loi : compare le corpus officiel actuel avec les textes utilisés par les documents générés et liste les documents à revoir.",
      parameters: { type: "object", properties: {} },
      async run(_input, ctx) {
        const r = await scanLawChanges(ctx.companyId);
        return { summary: `${r.impacts.length} document(s) impacté(s) sur ${r.scannedDocuments} document(s) ancré(s)`, data: r };
      },
    },
    {
      name: "loi_mettre_a_jour_document",
      description: "Met à jour la section « Fondement juridique » d'un document impacté par un changement du corpus (à faire relire ensuite).",
      parameters: { type: "object", properties: { document_id: { type: "string" } }, required: ["document_id"] },
      async run(input, ctx) {
        const doc = await updateDocumentLegalBasis(ctx.companyId, String(input.document_id ?? ""), "agent");
        return { summary: `Fondement juridique de « ${doc.title} » mis à jour`, data: { documentId: doc.id } };
      },
    },
  ],
  intents: [
    {
      name: "changement_loi",
      test: /changements? de (la )?loi|loi a change|textes? (a|ont) change|textes? modifies?|reingest|mise a jour du corpus|documents? (a|à) revoir/,
      async run({ call }) {
        const r = await call("loi_verifier_changements", {});
        const impacts = ((r?.data as { impacts?: { title: string; files: string[] }[] })?.impacts ?? []);
        return impacts.length
          ? `⚠️ **Changement de loi détecté** — ${impacts.length} document(s) à revoir :\n${impacts.map((i) => `- ${i.title} (texte modifié : ${i.files.join(", ")})`).join("\n")}\nProposition : mettre à jour leur fondement juridique depuis l'onglet **Veille réglementaire**.`
          : "✅ Aucun document généré n'est impacté par une modification du corpus officiel.";
      },
    },
  ],
};
