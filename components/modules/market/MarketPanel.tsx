"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EntrepreneurShell } from "@/components/modules/entrepreneur/Shell";

/** Onglet « Marché B2B » (niveau Entrepreneur) — logique dans lib/modules/entrepreneur, UI partagée dans components/modules/entrepreneur. */
export default function MarketPanel(props: TabProps) {
  return <EntrepreneurShell {...props} section="marche" />;
}
