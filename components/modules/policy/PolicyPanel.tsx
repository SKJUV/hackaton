"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EtatFrame, Simulator } from "@/components/modules/etat/EtatViews";

/** Onglet « policy » du niveau État (démo, données fictives). Logique : lib/modules/etat/. */
export default function PolicyPanel({ snap, notify, goTo }: TabProps) {
  return (
    <EtatFrame current="policy" goTo={goTo}>
      <Simulator snap={snap} notify={notify} goTo={goTo} />
    </EtatFrame>
  );
}
