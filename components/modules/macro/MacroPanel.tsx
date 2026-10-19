"use client";

import type { TabProps } from "@/components/workspace/Tabs";
import { EtatFrame, Macro } from "@/components/modules/etat/EtatViews";

/** Onglet « macro » du niveau État (démo, données fictives). Logique : lib/modules/etat/. */
export default function MacroPanel({ snap, notify, goTo }: TabProps) {
  return (
    <EtatFrame current="macro" goTo={goTo}>
      <Macro notify={notify} />
    </EtatFrame>
  );
}
