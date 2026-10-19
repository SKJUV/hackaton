"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepriseSection } from "./EntreprisePanels";

/** Onglet « intel » du niveau Entreprise. */
export default function EntrepriseIntelPanel(props: TabProps) {
  return <EntrepriseSection section="intel" {...props} />;
}
