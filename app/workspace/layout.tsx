import type { Metadata } from "next";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Workspace — Co-fondateur IA · Droit.cm",
  description: "Workspace entreprise : agent qui agit, emails, fournisseurs, démarches, conformité et assistant juridique sourcé.",
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
