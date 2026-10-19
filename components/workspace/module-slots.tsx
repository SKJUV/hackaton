"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { TabProps } from "./Tabs";

/**
 * EMPLACEMENTS DES MODULES — une ligne par module, chargée à la demande (next/dynamic).
 * Le composant reçoit les TabProps du workspace (snap, memberId, refresh, notify, goTo).
 * Convention : le composant vit dans components/modules/<module>/ et est exporté par défaut.
 */
const load = (loader: () => Promise<{ default: ComponentType<TabProps> }>) => dynamic(loader, { ssr: false, loading: () => <div className="ws-muted">Chargement du module…</div> });

export const MODULE_SLOTS: Record<string, ComponentType<TabProps>> = {
  structure: load(() => import("@/components/modules/structure/StructurePanel")),
  // ↓ modules : une ligne par module, ajoutée en fin de liste
  connecteurs: load(() => import("@/components/modules/mcp/ConnectorsPanel")),
  comms: load(() => import("@/components/modules/mcp/CommsPanel")),
  data: load(() => import("@/components/modules/entreprise/DataPanel")),
  finance: load(() => import("@/components/modules/entreprise/FinancePanel")),
  intel: load(() => import("@/components/modules/entreprise/IntelPanel")),
  risk: load(() => import("@/components/modules/entreprise/RiskPanel")),
  "due-diligence": load(() => import("@/components/modules/entreprise/DueDiligencePanel")),
  "data-room": load(() => import("@/components/modules/entreprise/DataRoomPanel")),
};
