"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepriseSection } from "./EntreprisePanels";

/** Onglet « due-diligence » du niveau Entreprise. */
export default function EntrepriseDueDiligencePanel(props: TabProps) {
  return <EntrepriseSection section="due-diligence" {...props} />;
}
