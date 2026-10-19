"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EtatFrame, Citizen } from "@/components/modules/etat/EtatViews";

/** Onglet « citizen » du niveau État (démo, données fictives). Logique : lib/modules/etat/. */
export default function CitizenPanel({ snap, notify, goTo }: TabProps) {
  return (
    <EtatFrame current="citizen" goTo={goTo}>
      <Citizen notify={notify} />
    </EtatFrame>
  );
}
