import type { Metadata } from "next";
import { AccountPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Mon compte — Fama AI" };

export default function Page() {
  return <AccountPage />;
}
