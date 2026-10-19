"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepriseSection } from "./EntreprisePanels";

/** Onglet « data-room » du niveau Entreprise. */
export default function EntrepriseDataRoomPanel(props: TabProps) {
  return <EntrepriseSection section="data-room" {...props} />;
}
