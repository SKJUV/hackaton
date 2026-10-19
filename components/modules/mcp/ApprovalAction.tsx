"use client";

import type { ConnectorAction } from "@/lib/modules/mcp/types";

/** Aperçu d'une approbation « action_connecteur » dans l'onglet Approbations. */
export function ApprovalAction({ action }: { action: ConnectorAction }) {
  return (
    <div className="ws-email-preview">
      <div><span>Connecteur</span> {action.connectionName}</div>
      <div><span>Outil</span> {action.tool}{action.sends ? " — envoi à un tiers" : ""}</div>
      <pre>{JSON.stringify(action.args, null, 2).slice(0, 3000)}</pre>
    </div>
  );
}
