import { DOCUMENT_QUERIES, sectorQuery } from "@/lib/agent/tools";
import { groundingMarkdown, groundQuery } from "@/lib/legal/grounding";
import { assertCompanyAccess, assertObjectAccess } from "@/lib/workspace/access";
import { generateBusinessPlan, generateLegalDocument, generateRoadmap, LEGAL_TEMPLATE_LABELS, type LegalTemplateKind } from "@/lib/cofounder/generators";
import { getSnapshot, saveDocument, WorkspaceError } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import type { DocumentKind } from "@/lib/workspace/types";

export const runtime = "nodejs";

/** Crée un document libre ou génère un document depuis un modèle (`generate`). */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const generate = s(b.generate);
    if (!generate) {
      return saveDocument(companyId, { title: s(b.title), kind: (s(b.kind) || "note") as DocumentKind, content: s(b.content) });
    }
    const snap = await getSnapshot(companyId);
    // Ancrage juridique : chaque document généré porte sa section « Fondement juridique » et ses sources.
    const basis = async (query: string) => {
      const g = await groundQuery(query, 4);
      return { md: `\n${groundingMarkdown(g)}`, meta: { legalQuery: g.query, legalSources: g.sources } };
    };
    if (generate === "business_plan" || generate === "roadmap") {
      const b = await basis(sectorQuery(snap.company));
      if (generate === "business_plan") return saveDocument(companyId, { title: `Business plan — ${snap.company.name}`, kind: "business_plan", content: generateBusinessPlan(snap.company) + b.md, ...b.meta });
      return saveDocument(companyId, { title: "Roadmap 6 mois", kind: "roadmap", content: generateRoadmap(snap.company, 6) + b.md, ...b.meta });
    }
    if (generate in LEGAL_TEMPLATE_LABELS) {
      const kind = generate as LegalTemplateKind;
      const b = await basis(DOCUMENT_QUERIES[kind] ?? LEGAL_TEMPLATE_LABELS[kind]);
      return saveDocument(companyId, { title: LEGAL_TEMPLATE_LABELS[kind], kind: kind === "statuts" ? "statuts" : kind === "pv_ag" ? "pv" : "contrat", content: generateLegalDocument(kind, snap.company, snap.members) + b.md, needsReview: true, ...b.meta });
    }
    throw new WorkspaceError("Modèle inconnu.");
  });
}
