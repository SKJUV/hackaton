"use client";

import { AlertTriangle, FlaskConical, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { api, Badge, Card, fmtDate } from "@/components/workspace/ui";
import type { LawImpact } from "@/lib/modules/law-watch/service";

type Scan = { impacts: LawImpact[]; scannedDocuments: number; corpusFiles: number };

/** Alerte de changement de loi : documents générés dont un texte source du corpus a changé. */
export function LawChangeCard({ snap, refresh, notify }: Pick<TabProps, "snap" | "refresh" | "notify">) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const companyId = snap.company.id;
  const load = useCallback(() => api<Scan>(`/api/legal-watch?companyId=${companyId}`).then(setScan).catch(() => setScan(null)), [companyId]);
  useEffect(() => void load(), [load]);

  async function act(key: string, body: Record<string, unknown>, ok: string) {
    setBusy(key);
    try {
      await api("/api/legal-watch", "POST", { companyId, ...body });
      await load();
      await refresh();
      notify(ok, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setBusy(null);
    }
  }

  const open = scan?.impacts.filter((i) => i.status === "a_revoir") ?? [];
  return (
    <Card
      title={<><AlertTriangle size={16} /> Alerte de changement de loi</>}
      actions={<>
        <button className="ws-btn ws-btn-sm" disabled={!!busy} onClick={() => void load()}><RefreshCw size={13} /> Vérifier</button>
        <button className="ws-btn ws-btn-sm ws-btn-ghost" disabled={!!busy} onClick={() => void act("sim", { action: "simuler" }, "Changement de loi simulé (démo)")}><FlaskConical size={13} /> Simuler un changement (démo)</button>
      </>}
    >
      <p className="ws-muted">
        Chaque document généré mémorise l&apos;empreinte des textes officiels qui le fondent. Après une ré-ingestion du corpus, les documents dont un texte a changé sont signalés ici.
        {scan && <> {scan.scannedDocuments} document(s) ancré(s) suivis · {scan.corpusFiles} texte(s) dans le corpus.</>}
      </p>
      {open.length === 0 ? (
        <p>✅ Aucun document à revoir.</p>
      ) : (
        <ul className="ws-list">
          {open.map((i) => (
            <li key={i.documentId}>
              <strong>{i.title}</strong> {i.simulated && <Badge tone="violet">démo</Badge>} <Badge tone="amber">à revoir</Badge>
              <div className="ws-muted">Texte(s) modifié(s) : {i.files.join(", ")} — détecté le {fmtDate(i.detectedAt, true)}</div>
              <div className="ws-row">
                <button className="ws-btn ws-btn-sm ws-btn-primary" disabled={busy === i.documentId} onClick={() => void act(i.documentId, { action: "mettre_a_jour", documentId: i.documentId }, "Fondement juridique mis à jour (à relire)")}>Mettre à jour le fondement</button>
                <button className="ws-btn ws-btn-sm ws-btn-ghost" disabled={busy === i.documentId} onClick={() => void act(i.documentId, { action: "ignorer", documentId: i.documentId }, "Alerte ignorée")}>Ignorer</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
