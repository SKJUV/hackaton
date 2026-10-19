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
  memoire: load(() => import("@/components/modules/memoire/MemoirePanel")),
  reunions: load(() => import("@/components/modules/memoire/ReunionsPanel")),
  score: load(() => import("@/components/modules/memoire/ScorePanel")),
  "bas-debit": load(() => import("@/components/modules/memoire/BasDebitPanel")),
};
