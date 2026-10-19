"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepriseSection } from "./EntreprisePanels";

/** Onglet « risk » du niveau Entreprise. */
export default function EntrepriseRiskPanel(props: TabProps) {
  return <EntrepriseSection section="risk" {...props} />;
}
