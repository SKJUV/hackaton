"use client";

/** Aperçu d'une approbation « connecteurs_action » (outil MCP / API native) dans l'onglet Approbations. */
export function ApprovalAction({ summary }: { summary: string }) {
  return (
    <div className="ws-email-preview">
      <pre>{summary.slice(0, 3000)}</pre>
    </div>
  );
}
