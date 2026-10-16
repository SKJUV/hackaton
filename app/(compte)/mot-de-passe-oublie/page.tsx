import type { Metadata } from "next";
import { ForgotPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Mot de passe oublié — Droit.cm" };

export default function Page() {
  return <ForgotPage />;
}
