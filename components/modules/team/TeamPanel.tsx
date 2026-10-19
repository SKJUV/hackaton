"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepreneurShell } from "@/components/modules/entrepreneur/Shell";

/** Onglet « Équipe & recrutement » (niveau Entrepreneur) — logique dans lib/modules/entrepreneur, UI partagée dans components/modules/entrepreneur. */
export default function TeamPanel(props: TabProps) {
  return <EntrepreneurShell {...props} section="equipe" />;
}
