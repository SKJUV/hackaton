import type { Metadata } from "next";
import "../(compte)/compte.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Workspace — Co-founder",
  description: "Workspace entreprise : agent qui agit, emails, fournisseurs, démarches, conformité et assistant juridique sourcé.",
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
