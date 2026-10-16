import type { User, WorkspaceData } from "./types";
import { readData } from "./store";
import { visibleCompanies, WorkspaceError } from "./service";

/**
 * Contrôle d'appartenance : un utilisateur n'agit que sur les entreprises dont il est membre (par email),
 * plus les entreprises de démonstration (`isExample`), partagées par conception.
 * Toute action par identifiant (approbation, devis, tâche, démarche, obligation, document, email)
 * remonte à l'entreprise propriétaire de l'objet avant d'être exécutée.
 */
export type Viewer = { user: User | null; email: string | null };

export type OwnedCollection = "approvals" | "tasks" | "quotes" | "checklist" | "obligations" | "documents" | "emails";

const LABELS: Record<OwnedCollection, string> = {
  approvals: "Approbation",
  tasks: "Tâche",
  quotes: "Devis",
  checklist: "Démarche",
  obligations: "Obligation",
  documents: "Document",
  emails: "Email",
};

export function canAccessCompany(data: WorkspaceData, companyId: string, email: string | null): boolean {
  return visibleCompanies(data, email).some((c) => c.id === companyId);
}

/** Lève 404 si l'entreprise n'existe pas ou n'est pas accessible (on ne révèle pas son existence). */
export function assertCompanyAccessIn(data: WorkspaceData, companyId: string, email: string | null) {
  const company = data.companies.find((c) => c.id === companyId);
  if (!company || !canAccessCompany(data, companyId, email)) throw new WorkspaceError("Entreprise introuvable.", 404);
  return company;
}

export async function assertCompanyAccess(companyId: string, viewer: Viewer) {
  return assertCompanyAccessIn(await readData(), companyId, viewer.email);
}

export function ownerCompanyId(data: WorkspaceData, collection: OwnedCollection, id: string): string | null {
  const list = data[collection] as { id: string; companyId: string }[];
  return list.find((x) => x.id === id)?.companyId ?? null;
}

/** Vérifie que l'objet appartient à une entreprise accessible ; renvoie l'identifiant de cette entreprise. */
export async function assertObjectAccess(collection: OwnedCollection, id: string, viewer: Viewer): Promise<string> {
  const data = await readData();
  const companyId = ownerCompanyId(data, collection, id);
  if (!companyId || !canAccessCompany(data, companyId, viewer.email)) throw new WorkspaceError(`${LABELS[collection]} introuvable.`, 404);
  return companyId;
}

/** Variante pour l'agent : l'objet doit appartenir à l'entreprise de la conversation. */
export async function assertObjectInCompany(collection: OwnedCollection, id: string, companyId: string) {
  const data = await readData();
  if (ownerCompanyId(data, collection, id) !== companyId) throw new WorkspaceError(`${LABELS[collection]} introuvable dans cette entreprise.`, 404);
}

/**
 * Le membre qui valide une action externe doit appartenir à l'entreprise de l'approbation.
 * Pour une vraie entreprise, il doit aussi être l'utilisateur connecté (même email) : on ne valide pas au nom d'un autre.
 * Pour une entreprise de démonstration, le sélecteur « Je suis » reste libre (jeu de rôle).
 */
export async function assertApprover(approvalId: string, memberId: string, viewer: Viewer) {
  const data = await readData();
  const companyId = ownerCompanyId(data, "approvals", approvalId);
  if (!companyId || !canAccessCompany(data, companyId, viewer.email)) throw new WorkspaceError("Approbation introuvable.", 404);
  const company = data.companies.find((c) => c.id === companyId)!;
  const member = data.members.find((m) => m.id === memberId && m.companyId === companyId);
  if (!member) throw new WorkspaceError("Membre inconnu dans cette entreprise : sélectionnez votre profil.", 403);
  if (!company.isExample && member.email.toLowerCase() !== (viewer.email ?? "").toLowerCase()) {
    throw new WorkspaceError("Vous ne pouvez valider qu'en votre nom : sélectionnez votre propre profil.", 403);
  }
  return member;
}
