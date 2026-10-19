import { assertCompanyAccess, handlePaid, readJson, s, WorkspaceError } from "@/lib/modules/http";
import { isFormId, type FormId } from "@/lib/modules/structure/catalog";
import { chooseStructure, generatePacte, recommendStructure, registrationGuide, simulateCreation, structureState, type PacteInput, type Questionnaire } from "@/lib/modules/structure/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Module « Structure & création » (Fama Legal étendu) : choix guidé, simulateur, pacte d'associés, guide d'immatriculation. */
export async function GET(request: Request) {
  return handlePaid(async (viewer) => {
    const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
    await assertCompanyAccess(companyId, viewer);
    return structureState(companyId);
  });
}

const form = (v: unknown): FormId => {
  const f = String(v ?? "").toUpperCase();
  if (!isFormId(f)) throw new WorkspaceError("Forme juridique inconnue.");
  return f;
};

export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const actor = viewer.email ?? "utilisateur";
    switch (s(b.action)) {
      case "recommander":
        return recommendStructure(companyId, (b.questionnaire ?? {}) as Questionnaire, actor);
      case "choisir":
        return chooseStructure(companyId, form(b.form), actor, b.reason ? s(b.reason) : undefined);
      case "simuler":
        return simulateCreation(companyId, (Array.isArray(b.forms) ? b.forms : []).map(form));
      case "pacte":
        return generatePacte(companyId, (b.pacte ?? {}) as PacteInput, actor);
      case "guide":
        return registrationGuide(companyId, form(b.form), { createTasks: b.createTasks === true }, actor);
      default:
        throw new WorkspaceError("Action inconnue.");
    }
  });
}
