"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepriseSection } from "./EntreprisePanels";

/** Onglet « data » du niveau Entreprise. */
export default function EntrepriseDataPanel(props: TabProps) {
  return <EntrepriseSection section="data" {...props} />;
}
