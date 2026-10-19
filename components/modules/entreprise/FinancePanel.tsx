"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepriseSection } from "./EntreprisePanels";

/** Onglet « finance » du niveau Entreprise. */
export default function EntrepriseFinancePanel(props: TabProps) {
  return <EntrepriseSection section="finance" {...props} />;
}
