import type { Metadata } from "next";
import "../(compte)/compte.css";
import "./workspace.css";
import { LiteModeBoot } from "@/components/memoire/LiteModeBoot";

export const metadata: Metadata = {
  title: "Workspace — Co-fondateur IA · Droit.cm",
  description: "Workspace entreprise : agent qui agit, emails, fournisseurs, démarches, conformité et assistant juridique sourcé.",
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LiteModeBoot />
      {children}
    </>
  );
}
