"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepreneurShell } from "@/components/modules/entrepreneur/Shell";

/** Onglet « Mentors » (niveau Entrepreneur) — logique dans lib/modules/entrepreneur, UI partagée dans components/modules/entrepreneur. */
export default function MentorPanel(props: TabProps) {
  return <EntrepreneurShell {...props} section="mentors" />;
}
