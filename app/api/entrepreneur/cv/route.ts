import { assertCompanyAccess, handlePaid, WorkspaceError } from "@/lib/modules/http";
import { extractPdfText, MAX_CV_BYTES } from "@/lib/modules/entrepreneur/cv";
import { importCandidate } from "@/lib/modules/entrepreneur/team";

export const runtime = "nodejs";

/** Import d'une candidature au format PDF (multipart/form-data : companyId, jobId, name, email, relation, referredBy, file). */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new WorkspaceError("Formulaire invalide.");
    }
    const get = (k: string) => (typeof form.get(k) === "string" ? String(form.get(k)) : "");
    const companyId = get("companyId");
    await assertCompanyAccess(companyId, viewer);
    const file = form.get("file");
    if (!file || typeof file === "string") throw new WorkspaceError("Fichier PDF manquant.");
    if (file.size > MAX_CV_BYTES) throw new WorkspaceError("CV trop volumineux (5 Mo maximum).", 413);
    const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
    const candidate = await importCandidate(companyId, { jobId: get("jobId"), name: get("name") || file.name.replace(/\.pdf$/i, ""), email: get("email") || undefined, cvText: text, source: "pdf", relation: get("relation") || undefined, referredBy: get("referredBy") || undefined });
    const { cvText, ...rest } = candidate;
    return { ...rest, extrait: cvText.slice(0, 400) };
  });
}
