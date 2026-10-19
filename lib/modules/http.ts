/**
 * Boîte à outils des routes API des modules (convention : app/api/<module>/…/route.ts).
 *
 *   export async function POST(request: Request) {
 *     return handlePaid(async (viewer) => {
 *       const b = await readJson(request);
 *       await assertCompanyAccess(s(b.companyId), viewer);   // TOUJOURS avant d'agir
 *       return monAction(s(b.companyId), …);
 *     });
 *   }
 *
 * - handlePaid : gating de l'offre payante (401/402) + gestion d'erreurs WorkspaceError.
 * - handle : route gratuite (ex. vérification publique d'un score).
 * - assertObjectAccess(collection, id, viewer) pour les objets du cœur ; pour les objets d'un module,
 *   vérifier que `item.companyId` est accessible via assertCompanyAccess.
 */
export { handle, handlePaid, readJson, s } from "@/lib/workspace/http";
export { assertCompanyAccess, assertObjectAccess, canAccessCompany, type Viewer } from "@/lib/workspace/access";
export { WorkspaceError } from "@/lib/workspace/service";
export { readData, withData, newId, nowIso } from "@/lib/workspace/store";
export { moduleState, forCompany } from "./state";
export { proposeExternalMessage } from "@/lib/workspace/actions";
