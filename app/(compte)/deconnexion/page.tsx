import type { Metadata } from "next";
import { LogoutPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Déconnexion — Droit.cm" };

export default function Page() {
  return <LogoutPage />;
}
