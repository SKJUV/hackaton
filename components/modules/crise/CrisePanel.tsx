"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EtatFrame, Crisis } from "@/components/modules/etat/EtatViews";

/** Onglet « crise » du niveau État (démo, données fictives). Logique : lib/modules/etat/. */
export default function CrisePanel({ snap, notify, goTo }: TabProps) {
  return (
    <EtatFrame current="crise" goTo={goTo}>
      <Crisis snap={snap} notify={notify} goTo={goTo} />
    </EtatFrame>
  );
}
