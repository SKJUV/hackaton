"use client";

import { Award, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { api, Badge, Card, Empty, fmtDate } from "@/components/workspace/ui";
import { useMemoire } from "./useMemoire";
import "./memoire.css";

const LEVEL: Record<string, { label: string; tone: "rose" | "amber" | "accent" | "green" }> = {
  insuffisant: { label: "Insuffisant", tone: "rose" },
  en_construction: { label: "En construction", tone: "amber" },
  fiable: { label: "Fiable", tone: "accent" },
  tres_fiable: { label: "Très fiable", tone: "green" },
};

/** Onglet « Score Co-founder » : calcul transparent, attestations signées Ed25519, vérification publique. */
export default function ScorePanel({ snap, memberId, notify }: TabProps) {
  const { data, error, reload } = useMemoire(snap.company.id);
  const [busy, setBusy] = useState(false);
  if (error) return <Card title="Score Co-founder"><p>{error}</p></Card>;
  if (!data) return <Card title="Score Co-founder"><p>Chargement…</p></Card>;
  const s = data.score;

  async function issue() {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/memoire/score", "POST", { companyId: snap.company.id, memberId });
      await reload();
      notify("Attestation signée émise");
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Révoquer cette attestation ? La page publique indiquera qu'elle n'est plus valide.")) return;
    try {
      await api(`/api/memoire/score?id=${encodeURIComponent(id)}`, "DELETE");
      await reload();
      notify("Attestation révoquée", "info");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    }
  }

  return (
    <div className="mem">
      <Card title={<><Award size={16} /> Score Co-founder</>} actions={<Badge tone={LEVEL[s.level].tone}>{LEVEL[s.level].label}</Badge>}>
        <div className="mem-score">
          <div className="mem-score-big">{s.score}<small>/100</small></div>
          <div>
            <p>Score de crédibilité calculé à partir du journal du workspace ({s.dataPoints} élément(s) évalué(s)). Méthodologie v{s.methodologyVersion}.</p>
            {snap.company.isExample && <p className="mem-warn">⚠️ Entreprise de démonstration : score calculé sur des données fictives.</p>}
            <button className="ws-btn ws-btn-primary" disabled={busy} onClick={() => void issue()}><ShieldCheck size={14} /> {busy ? "Signature…" : "Émettre une attestation signée"}</button>
            <p className="ws-muted">Signature Ed25519 · clé {data.signing.keyId}{data.signing.source === "dev" ? ` (clé de DÉMO${data.signing.storage === "memoire" ? " en mémoire, renouvelée à chaque démarrage" : data.signing.storage === "tmp" ? " dans /tmp, éphémère" : " générée localement"} — attestations « démo » ; configurez COFOUNDER_SCORE_SIGNING_KEY en production)` : ""}</p>
          </div>
        </div>
        <table className="mem-table">
          <thead><tr><th>Critère</th><th>Poids</th><th>Note</th><th>Détail</th></tr></thead>
          <tbody>
            {s.components.map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td>{Math.round(c.weight * 100)} %</td>
                <td>{c.score === null ? <span className="ws-muted">pas de données</span> : <div className="mem-bar"><i style={{ width: `${c.score}%` }} /><span>{c.score}</span></div>}</td>
                <td className="ws-muted">{c.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Attestations émises">
        {!data.attestations.length ? <Empty>Aucune attestation. Émettez-en une pour la présenter à un investisseur ou un partenaire (lien public + QR code).</Empty> : (
          <ul className="mem-list">
            {data.attestations.map((a) => (
              <li key={a.id}>
                <div className="mem-row">
                  <strong>{a.score}/100</strong>
                  <span className="ws-muted">émise le {fmtDate(a.issuedAt, true)} · expire le {fmtDate(a.expiresAt)}</span>
                  {a.demo && <Badge tone="amber">Démo</Badge>}
                  {a.revokedAt ? <Badge tone="rose">Révoquée</Badge> : <Badge tone="green">Active</Badge>}
                  <a className="ws-link" href={a.verifyPath ?? `/verifier/${a.id}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> /verifier/{a.id}</a>
                  {!a.revokedAt && <button className="ws-link" onClick={() => void revoke(a.id)}><XCircle size={13} /> Révoquer</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Méthodologie de calcul (v${data.methodology.version})`}>
        <p>{data.methodology.intro}</p>
        <ul>{data.methodology.criteria.map((c) => <li key={c.key}><strong>{c.label} — {Math.round(c.weight * 100)} %</strong> : {c.rule}</li>)}</ul>
        <p>{data.methodology.aggregation}</p>
        <p className="ws-muted">{data.methodology.signature}</p>
      </Card>
    </div>
  );
}
