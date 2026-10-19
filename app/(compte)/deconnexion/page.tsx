import type { Metadata } from "next";
import { LogoutPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Déconnexion — Co-founder" };

export default function Page() {
  return <LogoutPage />;
}
