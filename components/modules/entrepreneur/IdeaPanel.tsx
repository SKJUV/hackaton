"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge, Card, Empty, fmtDate } from "@/components/workspace/ui";
import type { IdeaDiagnostic } from "@/lib/modules/entrepreneur/types";
import { ArticleTable, pdfHref, type PanelProps } from "./shared";

export function IdeaPanel({ ent, act, busy, snap }: PanelProps) {
  const [form, setForm] = useState({ idee: snap.company.description, cible: "", modele_revenus: "", concurrents: "", differenciation: "", enregistrer_document: false });
  const [selected, setSelected] = useState<string | null>(null);
  const current: IdeaDiagnostic | undefined = ent.ideas.find((i) => i.id === selected) ?? ent.ideas[0];
  async function run() {
    const r = await act<IdeaDiagnostic>("idea_analyser", { ...form, concurrents: form.concurrents.split(",").map((x) => x.trim()).filter(Boolean) });
    if (r) setSelected(r.data.id);
  }
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="ws-stack">
      <Card title="Décrire l'idée" actions={<Badge tone="violet">Diagnostic honnête — pas de validation automatique</Badge>}>
        <div className="ent-form">
          <textarea rows={4} placeholder="Problème, solution, pour qui, comment vous gagnez de l'argent…" value={form.idee} onChange={set("idee")} />
          <div className="ent-row">
            <input placeholder="Clients cibles" value={form.cible} onChange={set("cible")} />
            <input placeholder="Modèle de revenus (commission, abonnement…)" value={form.modele_revenus} onChange={set("modele_revenus")} />
          </div>
          <div className="ent-row">
            <input placeholder="Concurrents connus (séparés par des virgules)" value={form.concurrents} onChange={set("concurrents")} />
            <input placeholder="Différenciation" value={form.differenciation} onChange={set("differenciation")} />
          </div>
          <label className="ent-row ent-muted" style={{ flex: "none" }}><input type="checkbox" style={{ width: "auto", flex: "none" }} checked={form.enregistrer_document} onChange={(e) => setForm({ ...form, enregistrer_document: e.target.checked })} /> Enregistrer le diagnostic dans Documents</label>
          <button className="ws-btn ws-btn-primary" disabled={busy === "idea_analyser" || form.idee.trim().length < 10} onClick={() => void run()}><Sparkles size={14} /> {busy === "idea_analyser" ? "Analyse du corpus…" : "Analyser l'idée"}</button>
        </div>
      </Card>

      {!current ? (
        <Empty>Aucun diagnostic pour l&apos;instant.</Empty>
      ) : (
        <>
          {ent.ideas.length > 1 && (
            <div className="ent-row ent-muted">Historique : <select value={current.id} onChange={(e) => setSelected(e.target.value)}>{ent.ideas.map((i) => <option key={i.id} value={i.id}>{fmtDate(i.createdAt, true)} — {i.score}/100</option>)}</select></div>
          )}
          <div className={`ent-verdict is-${current.verdict}`}>
            <b>{current.score}</b>
            <div><strong>{current.verdictLabel}</strong><div className="ent-muted">Indice de maturité du dossier (0–100), jamais une validation. Plafonné à 85 : seul le terrain valide une idée.</div></div>
          </div>
          <div className="ent-two">
            <Card title={`Faiblesses (${current.weaknesses.length})`}><ul className="ent-list">{current.weaknesses.map((w) => <li key={w}>{w}</li>)}</ul></Card>
            <Card title={`Forces (${current.strengths.length})`}>{current.strengths.length ? <ul className="ent-list">{current.strengths.map((w) => <li key={w}>{w}</li>)}</ul> : <Empty>Aucune force démontrée à ce stade.</Empty>}</Card>
          </div>
          <Card title="Obstacles réglementaires — article par article (corpus officiel)">
            {current.obstacles.map((o) => (
              <div key={o.theme} style={{ marginBottom: 12 }}>
                <h4 style={{ margin: "4px 0" }}>{o.theme} <Badge tone={o.status === "fonde" ? "green" : o.status === "partiel" ? "amber" : "rose"}>{o.status === "non_couvert" ? "non couvert" : o.status}</Badge></h4>
                <ArticleTable rows={o.articles} />
              </div>
            ))}
          </Card>
          <div className="ent-two">
            <Card title="Marché">
              <p className="ent-muted">{current.market.note}</p>
              <ul className="ent-list">{current.market.indicators.map((m, i) => <li key={i}><a className="ws-link" href={pdfHref(m.source, m.page)} target="_blank" rel="noreferrer">{m.document}, p. {m.page} <ExternalLink size={11} /></a> — « {m.extrait.slice(0, 260)}… »</li>)}</ul>
            </Card>
            <Card title="Concurrents" actions={<Badge tone={current.competitorsMode === "web" ? "green" : "amber"}>{current.competitorsMode === "web" ? "Recherche web réelle" : "Démo : catégories génériques"}</Badge>}>
              <ul className="ent-list">{current.competitors.map((c, i) => <li key={i}><strong>{c.url ? <a className="ws-link" href={c.url} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</strong> <Badge tone={c.kind === "declare" ? "accent" : c.kind === "web" ? "green" : "neutral"}>{c.kind === "declare" ? "déclaré" : c.kind === "web" ? "web" : "catégorie"}</Badge> <span className="ent-muted">{c.detail}</span></li>)}</ul>
            </Card>
          </div>
          <div className="ent-two">
            <Card title="Conditions de succès"><ul className="ent-list">{current.successConditions.map((w) => <li key={w}>{w}</li>)}</ul></Card>
            <Card title="Pivots et alternatives"><ul className="ent-list">{current.pivots.map((w) => <li key={w}>{w}</li>)}</ul></Card>
          </div>
        </>
      )}
    </div>
  );
}
