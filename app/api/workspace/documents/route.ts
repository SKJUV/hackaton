import { generateBusinessPlan, generateLegalDocument, generateRoadmap, LEGAL_TEMPLATE_LABELS, type LegalTemplateKind } from "@/lib/cofounder/generators";
import { getSnapshot, saveDocument, WorkspaceError } from "@/lib/workspace/service";
import { handle, readJson, s } from "@/lib/workspace/http";
import type { DocumentKind } from "@/lib/workspace/types";

export const runtime = "nodejs";

/** Crée un document libre ou génère un document depuis un modèle (`generate`). */
export async function POST(request: Request) {
  return handle(async () => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    const generate = s(b.generate);
    if (!generate) {
      return saveDocument(companyId, { title: s(b.title), kind: (s(b.kind) || "note") as DocumentKind, content: s(b.content) });
    }
    const snap = await getSnapshot(companyId);
    if (generate === "business_plan") return saveDocument(companyId, { title: `Business plan — ${snap.company.name}`, kind: "business_plan", content: generateBusinessPlan(snap.company) });
    if (generate === "roadmap") return saveDocument(companyId, { title: "Roadmap 6 mois", kind: "roadmap", content: generateRoadmap(snap.company, 6) });
    if (generate in LEGAL_TEMPLATE_LABELS) {
      const kind = generate as LegalTemplateKind;
      return saveDocument(companyId, { title: LEGAL_TEMPLATE_LABELS[kind], kind: kind === "statuts" ? "statuts" : kind === "pv_ag" ? "pv" : "contrat", content: generateLegalDocument(kind, snap.company, snap.members), needsReview: true });
    }
    throw new WorkspaceError("Modèle inconnu.");
  });
}
