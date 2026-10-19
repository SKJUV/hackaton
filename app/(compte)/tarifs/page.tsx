import type { Metadata } from "next";
import { PricingPage } from "@/components/auth/Pricing";

export const metadata: Metadata = { title: "Tarifs — Fama AI", description: "Assistant juridique gratuit, co-fondateur IA en abonnement." };

export default function Page() {
  return <PricingPage />;
}
