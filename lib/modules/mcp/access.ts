import { assertCompanyAccessIn, type Viewer } from "@/lib/workspace/access";
import { WorkspaceError } from "@/lib/workspace/service";
import { readMcp } from "./repo";

/**
 * Accès : membre de l'entreprise (ou entreprise de démo). Les modifications (ajout/suppression de
 * connecteurs, secrets, jetons MCP) sont refusées aux « lecteurs » d'une vraie entreprise.
 */
export async function assertCompany(companyId: string, viewer: Viewer, manage = false) {
  const { data } = await readMcp();
  const company = assertCompanyAccessIn(data, companyId, viewer.email);
  if (manage && !company.isExample) {
    const member = data.members.find((m) => m.companyId === companyId && m.email.toLowerCase() === (viewer.email ?? "").toLowerCase());
    if (!member || member.role === "lecteur") throw new WorkspaceError("Action réservée aux propriétaires, administrateurs et membres.", 403);
  }
  return company;
}

export async function assertConnection(connectionId: string, viewer: Viewer, manage = false) {
  const { mcp } = await readMcp();
  const conn = mcp.connections.find((c) => c.id === connectionId);
  if (!conn) throw new WorkspaceError("Connecteur introuvable.", 404);
  try {
    await assertCompany(conn.companyId, viewer, manage);
  } catch (error) {
    if (error instanceof WorkspaceError && error.status === 404) throw new WorkspaceError("Connecteur introuvable.", 404);
    throw error;
  }
  return conn;
}

export function actorName(viewer: Viewer) {
  return viewer.user?.name || viewer.email || "utilisateur";
}
