import type { Metadata } from "next";
import { SignupPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Inscription — Fama AI" };

export default function Page() {
  return <SignupPage />;
}
