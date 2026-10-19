import type { Metadata } from "next";
import { AccountPage } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Mon compte — Co-founder" };

export default function Page() {
  return <AccountPage />;
}
