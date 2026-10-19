import type { Metadata } from "next";
import { ForgotPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Mot de passe oublié — Fama AI" };

export default function Page() {
  return <ForgotPage />;
}
