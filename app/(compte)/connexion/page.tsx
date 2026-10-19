import type { Metadata } from "next";
import { LoginPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Connexion — Co-founder" };

export default function Page() {
  return <LoginPage />;
}
