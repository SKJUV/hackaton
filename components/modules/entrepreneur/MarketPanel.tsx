"use client";

import { Search, Send } from "lucide-react";
import { useState } from "react";
import { Badge, Card, Empty, ExampleBadge } from "@/components/workspace/ui";
import { BasisLine, type PanelProps } from "./shared";

type Row = { id: string; nom: string; categorie: string; ville: string; compatibilite: number; solidite: number; global: number; correspondances: string[]; exemple: boolean };
type Result = { avertissement: string; fondement_juridique: Parameters<typeof BasisLine>[0]["basis"]; partenaires: Row[] };

export function MarketPanel({ act, busy, snap, goTo }: PanelProps) {
  const [q, setQ] = useState({ besoin: "", ville: snap.company.city, categorie: "", solidite_min: "" });
  const [res, setRes] = useState<Result | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("");
  const categories = [...new Set(snap.suppliers.map((s) => s.category))];
  async function search() {
    const r = await act<Result>("market_rechercher_partenaires", { ...q, solidite_min: q.solidite_min ? Number(q.solidite_min) : undefined });
    if (r) {
      setRes(r.data);
      setPicked([]);
    }
  }
  return (
    <div className="ws-stack">
      <div className="ws-info">Place de marché B2B construite sur l&apos;annuaire fournisseurs du workspace : compatibilité avec votre besoin et solidité du partenaire. <b>Les indicateurs de solidité sont des données d&apos;exemple (seed)</b>, à remplacer par un registre officiel ou des états financiers.</div>
      <Card title="Exprimer un besoin">
        <div className="ent-row">
          <div className="ws-search" style={{ flex: "2 1 260px" }}><Search size={14} /><input placeholder="Ex. sacs de livraison isothermes, assurance flotte…" value={q.besoin} onChange={(e) => setQ({ ...q, besoin: e.target.value })} /></div>
          <input placeholder="Ville" value={q.ville} onChange={(e) => setQ({ ...q, ville: e.target.value })} />
          <select value={q.categorie} onChange={(e) => setQ({ ...q, categorie: e.target.value })}><option value="">Toutes catégories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <input type="number" min={0} max={100} placeholder="Solidité min." value={q.solidite_min} onChange={(e) => setQ({ ...q, solidite_min: e.target.value })} />
          <button className="ws-btn ws-btn-primary" style={{ flex: "none" }} disabled={busy === "market_rechercher_partenaires"} onClick={() => void search()}>Rechercher</button>
        </div>
      </Card>
      {res && (
        <Card title={`Partenaires compatibles (${res.partenaires.length})`} actions={<ExampleBadge />}>
          <BasisLine basis={res.fondement_juridique} />
          <p className="ent-muted">{res.avertissement}</p>
          {!res.partenaires.length ? <Empty>Aucun partenaire compatible dans l&apos;annuaire.</Empty> : (
            <table className="ws-table">
              <thead><tr><th /><th>Partenaire</th><th>Compatibilité</th><th>Solidité (exemple)</th><th>Global</th></tr></thead>
              <tbody>
                {res.partenaires.map((p) => (
                  <tr key={p.id}>
                    <td><input type="checkbox" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} /></td>
                    <td>{p.nom}<div className="ent-muted">{p.categorie} · {p.ville}{p.correspondances.length ? ` · correspond : ${p.correspondances.join(", ")}` : ""}</div></td>
                    <td><div className="ent-bar"><div style={{ width: `${p.compatibilite}%` }} /></div>{p.compatibilite}/100</td>
                    <td><Badge tone={p.solidite >= 65 ? "green" : p.solidite >= 40 ? "amber" : "rose"}>{p.solidite}/100</Badge></td>
                    <td><b>{p.global}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="ent-row" style={{ marginTop: 10 }}>
            <input placeholder="Quantité (facultatif)" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <button className="ws-btn ws-btn-primary" style={{ flex: "none" }} disabled={!picked.length || !q.besoin.trim() || busy === "market_demander_devis"} onClick={() => void act("market_demander_devis", { partenaire_ids: picked, besoin: q.besoin, quantite: quantity }, "Demandes de devis placées dans la file d'approbation")}><Send size={13} /> Demander des devis ({picked.length})</button>
            <button className="ws-btn ws-btn-sm" style={{ flex: "none" }} onClick={() => goTo("fournisseurs")}>Suivi des devis</button>
          </div>
        </Card>
      )}
    </div>
  );
}
