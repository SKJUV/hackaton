import type { Metadata } from "next";
import { SignupPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Inscription — Droit.cm" };

export default function Page() {
  return <SignupPage />;
}
