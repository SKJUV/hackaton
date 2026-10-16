import type { Metadata } from "next";
import { DemoOutbox } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Boîte d'envoi de démo — Droit.cm" };

export default function Page() {
  return <DemoOutbox />;
}
