"use client";

import { ExternalLink, FilePlus2, RefreshCw, Send } from "lucide-react";
import { useState } from "react";
import { Badge, Card, Empty, ExampleBadge, fmtDate } from "@/components/workspace/ui";
import { Pill, VERDICT, type PanelProps } from "./shared";

const APP_STATUS: Record<string, string> = { a_preparer: "À préparer", dossier_pret: "Dossier prêt", soumise: "Soumise", en_attente_reponse: "En attente de réponse", acceptee: "Acceptée", refusee: "Refusée", abandonnee: "Abandonnée" };
const PROFILE_FIELDS = [
  { key: "age_fondateur", prop: "founderAge", label: "Âge du fondateur", type: "number" },
  { key: "annees_activite", prop: "yearsOperating", label: "Années d'activité", type: "number" },
  { key: "taille_equipe", prop: "teamSize", label: "Nb de fondateurs", type: "number" },
  { key: "leve_usd", prop: "fundingRaisedUsd", label: "Montant levé (USD)", type: "number" },
  { key: "prototype", prop: "hasPrototype", label: "Prototype / MVP", type: "bool" },
  { key: "immatriculee", prop: "isRegistered", label: "Immatriculée", type: "bool" },
  { key: "revenus", prop: "hasRevenue", label: "Revenus", type: "bool" },
  { key: "numerique", prop: "isDigital", label: "Produit numérique", type: "bool" },
] as const;

export function FundingPanel({ ent, act, busy }: PanelProps) {
  const [filter, setFilter] = useState<"all" | "eligible" | "a_verifier" | "non_eligible">("all");
  const [showExamples, setShowExamples] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [contact, setContact] = useState<Record<string, string>>({});
  const profile = (ent.profile ?? {}) as Record<string, unknown>;
  const rows = ent.programs.filter((r) => (filter === "all" || r.eligibility.verdict === filter) && (showExamples || !r.program.isExample));

  function saveProfile(key: string, value: string, type: string) {
    const v = type === "number" ? (value === "" ? undefined : Number(value)) : value === "" ? undefined : value === "true";
    if (v === undefined) return;
    void act("fund_profil_projet", { [key]: v }, "Profil mis à jour");
  }

  return (
    <div className="ws-stack">
      <Card title="Profil du projet (éligibilité)" actions={ent.missingProfile.length ? <Badge tone="amber">{ent.missingProfile.length} champ(s) à renseigner</Badge> : <Badge tone="green">Complet</Badge>}>
        <div className="ent-row">
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className="ent-muted" style={{ display: "grid", gap: 4 }}>
              {f.label}
              {f.type === "number" ? (
                <input type="number" min={0} defaultValue={profile[f.prop] as number | undefined} onBlur={(e) => saveProfile(f.key, e.target.value, f.type)} />
              ) : (
                <select value={profile[f.prop] === undefined ? "" : String(profile[f.prop])} onChange={(e) => saveProfile(f.key, e.target.value, f.type)}>
                  <option value="">Non renseigné</option><option value="true">Oui</option><option value="false">Non</option>
                </select>
              )}
            </label>
          ))}
        </div>
        <p className="ent-muted">Un champ non renseigné donne « à vérifier », jamais une supposition.</p>
      </Card>

      <Card title={`Mes candidatures (${ent.applications.length})`}>
        {!ent.applications.length ? <Empty>Préparez un dossier depuis un programme ci-dessous.</Empty> : (
          <table className="ws-table">
            <thead><tr><th>Programme</th><th>Statut</th><th>Relance prévue</th><th>Relances</th><th /></tr></thead>
            <tbody>
              {ent.applications.map((a) => (
                <tr key={a.id}>
                  <td>{a.programName}{a.documentId && <div className="ent-muted">Dossier dans Documents</div>}</td>
                  <td>
                    <select value={a.status} onChange={(e) => void act("fund_mettre_a_jour_candidature", { candidature_id: a.id, statut: e.target.value }, "Statut mis à jour")}>
                      {Object.entries(APP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>{a.nextFollowUp ? fmtDate(a.nextFollowUp) : "—"} {a.due && <Badge tone="amber">à relancer</Badge>}</td>
                  <td className="ws-small">{a.followUps.length ? a.followUps.map((f) => `${fmtDate(f.createdAt)} (${f.approvalStatus === "en_attente" ? "à valider" : f.emailStatus})`).join(", ") : "—"}</td>
                  <td className="ws-actions">
                    {["soumise", "en_attente_reponse"].includes(a.status) && (
                      <>
                        {!a.contactEmail && <input placeholder="Email du programme" value={contact[a.id] ?? ""} onChange={(e) => setContact({ ...contact, [a.id]: e.target.value })} />}
                        <button className="ws-btn ws-btn-sm" disabled={busy === "fund_relancer_programme"} onClick={() => void act("fund_relancer_programme", { candidature_id: a.id, destinataire: contact[a.id] }, "Relance placée dans la file d'approbation")}><RefreshCw size={13} /> Relancer</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Programmes de financement" actions={
        <div className="ent-row" style={{ flexWrap: "nowrap" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Tous</option><option value="eligible">Éligibles</option><option value="a_verifier">À vérifier</option><option value="non_eligible">Non éligibles</option>
          </select>
          <label className="ent-muted ws-nowrap"><input type="checkbox" checked={showExamples} onChange={(e) => setShowExamples(e.target.checked)} /> exemples</label>
        </div>
      }>
        <p className="ent-muted">Programmes réels : vérifiés par recherche web (lien source et date). Les dates limites changent chaque année : revérifiez avant de candidater. Programmes « Exemple » : fictifs.</p>
        <div className="ent-card-grid">
          {rows.map(({ program: p, eligibility: e }) => (
            <div key={p.id} className="ent-mini">
              <h4>{p.name} {p.isExample ? <ExampleBadge /> : <Badge tone="green" title={`Vérifié le ${p.verifiedAt}`}>Vérifié {p.verifiedAt}</Badge>} <Badge tone={VERDICT[e.verdict].tone}>{VERDICT[e.verdict].label}</Badge></h4>
              <p>{p.organization} · {p.type}</p>
              <p>{p.benefits.join(" ; ")}</p>
              <p className="ent-muted">{e.window}</p>
              <div className="ent-bar"><div style={{ width: `${e.score}%` }} /></div>
              {open === p.id && (
                <div className="ent-crit">
                  {e.results.map((r) => <div key={r.label}><Pill ok={r.status}>{r.status === "ok" ? "ok" : r.status === "ko" ? "ko" : "?"}</Pill><span><b>{r.label}</b> — {r.detail}</span></div>)}
                  {p.caveat && <p className="ent-muted">{p.caveat}</p>}
                  {p.sources.map((s) => <a key={s} className="ws-link" href={s} target="_blank" rel="noreferrer">Source <ExternalLink size={11} /></a>)}
                </div>
              )}
              <div className="ent-row">
                <button className="ws-btn ws-btn-sm" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Masquer" : "Critères"}</button>
                <button className="ws-btn ws-btn-sm ws-btn-primary" disabled={busy === "fund_preparer_dossier"} onClick={() => void act("fund_preparer_dossier", { programme_id: p.id })}><FilePlus2 size={13} /> Préparer le dossier</button>
                <a className="ws-btn ws-btn-sm" href={p.applyUrl} target="_blank" rel="noreferrer"><Send size={13} /> Candidater</a>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
