"use client";

import { AlertTriangle, FilePlus2, Filter, Scale, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, Empty, ExampleBadge } from "@/components/workspace/ui";
import { ArticleTable, BasisLine, type PanelProps } from "./shared";

const RELATIONS = [
  { v: "aucune", l: "Aucune relation" },
  { v: "ami", l: "Ami·e" },
  { v: "famille", l: "Famille" },
  { v: "ancien_collegue", l: "Ancien·ne collègue" },
  { v: "recommandation", l: "Recommandation personnelle" },
];
const DECISION: Record<string, string> = { a_rencontrer: "À rencontrer", ecarte: "Écarté·e", offre: "Offre" };

type Compliance = {
  droit_du_travail: { statut: string; libelle: string; detail: string; sources: import("@/lib/modules/entrepreneur/types").ArticleRow[] };
  bonnes_pratiques: string[];
  fondement_juridique: { statut: string; libelle: string; sources: { id: string; document: string; page: number; articles: string[]; exemple_non_officiel: boolean }[] };
};

export function TeamPanel({ ent, act, busy, memberId, snap, notify, refresh }: PanelProps) {
  const [skills, setSkills] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string>(ent.jobs[ent.jobs.length - 1]?.id ?? "");
  const job = ent.jobs.find((j) => j.id === jobId) ?? ent.jobs[ent.jobs.length - 1];
  const [threshold, setThreshold] = useState<number | null>(null);
  const [cand, setCand] = useState({ nom: "", email: "", relation: "aucune", recommande_par: "", cv_texte: "" });
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<Record<string, { note: number; commentaire: string }>>({});
  const [showLow, setShowLow] = useState(false);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const list = useMemo(() => ent.candidates.filter((c) => c.jobId === job?.id).sort((a, b) => b.score - a.score), [ent.candidates, job?.id]);
  const shortlist = list.filter((c) => c.status === "retenu" || c.override);
  const low = list.filter((c) => c.status === "sous_seuil" && !c.override);
  const me = snap.members.find((m) => m.id === memberId);

  async function importCv() {
    if (!job) return;
    if (file) {
      const fd = new FormData();
      fd.set("companyId", snap.company.id);
      fd.set("jobId", job.id);
      fd.set("name", cand.nom);
      fd.set("email", cand.email);
      fd.set("relation", cand.relation);
      fd.set("referredBy", cand.recommande_par);
      fd.set("file", file);
      const res = await fetch("/api/entrepreneur/cv", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { error?: string; score?: number; name?: string };
      if (!res.ok) return notify(data.error ?? `Erreur ${res.status}`, "error");
      notify(`CV PDF importé : ${data.name} — ${data.score}/100`);
      setFile(null);
      await act("team_filtrer_candidatures", { offre_id: job.id }, "Liste mise à jour");
      await refresh();
    } else {
      const r = await act("team_importer_candidature", { offre_id: job.id, ...cand });
      if (!r) return;
    }
    setCand({ nom: "", email: "", relation: "aucune", recommande_par: "", cv_texte: "" });
  }

  async function forceShortlist(id: string) {
    const reason = window.prompt("Justification (critères du poste) pour passer ce profil en liste courte malgré le seuil :");
    if (!reason) return;
    await act("team_decider_candidat", { candidat_id: id, forcer_liste_courte: true, justification: reason });
  }

  return (
    <div className="ws-stack">
      <div className="ent-two">
        <Card title="Compétences de l'équipe">
          <table className="ws-table">
            <thead><tr><th>Membre</th><th>Compétences (séparées par des virgules)</th></tr></thead>
            <tbody>
              {ent.team.members.map((m) => (
                <tr key={m.memberId}>
                  <td>{m.name}<div className="ent-muted">{m.role}</div></td>
                  <td>
                    <input defaultValue={m.skills.join(", ")} onChange={(e) => setSkills({ ...skills, [m.memberId]: e.target.value })} onBlur={() => skills[m.memberId] !== undefined && void act("team_definir_competences_membre", { membre_id: m.memberId, competences: skills[m.memberId].split(",") }, "Compétences enregistrées")} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Compétences requises vs couvertes">
          <table className="ws-table">
            <tbody>
              {ent.team.rows.map((r) => (
                <tr key={r.domain}>
                  <td>{r.label} {r.critical && <Badge tone="rose">critique</Badge>}<div className="ent-muted">{r.why}</div></td>
                  <td>{r.covered ? <Badge tone="green">{r.holders.join(", ")}</Badge> : <Badge tone="amber">manquante</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Profils idéaux (co-fondateurs, premiers employés)">
        {!ent.team.profiles.length ? <Empty>Aucune compétence manquante d&apos;après les compétences déclarées.</Empty> : (
          <div className="ent-card-grid">
            {ent.team.profiles.map((p) => (
              <div key={p.domain} className="ent-mini">
                <h4>{p.title} <Badge tone={p.kind === "cofondateur" ? "violet" : p.kind === "prestataire" ? "neutral" : "accent"}>{p.kind}</Badge></h4>
                <p>{p.why}</p>
                <ul className="ent-list">{p.missions.map((m) => <li key={m}>{m}</li>)}</ul>
                <p className="ent-muted">Critères : {p.criteria.map((c) => `${c.label} (${c.weight}${c.required ? ", obligatoire" : ""})`).join(" · ")} · expérience ≥ {p.minYears} ans</p>
                <button className="ws-btn ws-btn-sm ws-btn-primary" disabled={busy === "team_rediger_fiche_de_poste"} onClick={async () => { const r = await act<{ offre: { id: string } }>("team_rediger_fiche_de_poste", { intitule: p.title, domaine: p.domain, type: p.kind === "cofondateur" ? "cofondateur" : "employe" }); if (r) setJobId(r.data.offre.id); }}><FilePlus2 size={13} /> Rédiger la fiche de poste</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Recrutement" actions={
        ent.jobs.length ? (
          <select value={job?.id} onChange={(e) => { setJobId(e.target.value); setThreshold(null); }}>
            {ent.jobs.map((j) => <option key={j.id} value={j.id}>{j.title} ({j.count})</option>)}
          </select>
        ) : null
      }>
        {!job ? <Empty>Rédigez d&apos;abord une fiche de poste.</Empty> : (
          <div className="ws-stack">
            <div className="ent-row">
              <span className="ent-muted" style={{ flex: "2 1 300px" }}>Critères objectifs : {job.criteria.map((c) => `${c.label} (${c.weight}${c.required ? ", obligatoire" : ""})`).join(" · ")}{job.minYears ? ` · expérience ≥ ${job.minYears} ans` : ""} {job.isExample && <ExampleBadge />}</span>
              <label className="ent-muted">Seuil : <b>{threshold ?? job.threshold}</b>/100<input type="range" min={10} max={95} step={5} value={threshold ?? job.threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label>
              <button className="ws-btn ws-btn-sm" disabled={busy === "team_filtrer_candidatures"} onClick={() => void act("team_filtrer_candidatures", { offre_id: job.id, seuil: threshold ?? job.threshold })}><Filter size={13} /> Filtrer</button>
            </div>
            <p className="ent-muted">Score aveugle : nom, email et téléphone sont retirés du CV avant l&apos;analyse ; âge, genre, origine et photo ne sont jamais lus. Les profils sous le seuil restent consultables.</p>

            {job.alerts.length > 0 && (
              <div className="ws-stack">
                {job.alerts.map((a, i) => <div key={i} className={`ent-alert is-${a.level}`}><AlertTriangle size={13} /> <b>{a.level === "alerte" ? "Biais affinitaire" : "Attention"}</b> — {a.message}<div className="ent-muted">{a.advice}</div></div>)}
              </div>
            )}

            <h4>Liste courte ({shortlist.length}) — analyse collaborative</h4>
            {!shortlist.length ? <Empty>Aucun profil au-dessus du seuil.</Empty> : (
              <div className="ent-card-grid">
                {shortlist.map((c) => {
                  const avg = c.reviews.length ? (c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length).toFixed(1) : null;
                  const mine = review[c.id] ?? { note: 3, commentaire: "" };
                  const spread = c.reviews.length > 1 ? Math.max(...c.reviews.map((r) => r.rating)) - Math.min(...c.reviews.map((r) => r.rating)) : 0;
                  return (
                    <div key={c.id} className="ent-mini">
                      <h4>{c.name} <Badge tone="accent">{c.score}/100</Badge> {c.relation !== "aucune" && <Badge tone="amber">{RELATIONS.find((r) => r.v === c.relation)?.l}</Badge>} {c.override && <Badge tone="rose">forcé</Badge>} {c.decision && <Badge tone="violet">{DECISION[c.decision]}</Badge>} {c.isExample && <ExampleBadge />}</h4>
                      <div className="ent-crit">{c.breakdown.map((b) => <div key={b.label}><span className="ws-nowrap">{b.points}/{b.max}</span><span>{b.label}{b.matched.length ? ` — ${b.matched.join(", ")}` : ""}</span></div>)}</div>
                      <p className="ent-muted">« {c.extrait.slice(0, 200)}… »</p>
                      <p>Équipe : {avg ? `${avg}/5 (${c.reviews.length} avis)` : "pas encore d'avis"} {spread >= 2 && <Badge tone="amber">avis divergents : en discuter</Badge>}</p>
                      <ul className="ent-list">{c.reviews.map((r) => <li key={r.id}><b>{r.memberName}</b> : {r.rating}/5 — {r.notes}</li>)}</ul>
                      <div className="ent-row">
                        <select value={mine.note} onChange={(e) => setReview({ ...review, [c.id]: { ...mine, note: Number(e.target.value) } })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}</select>
                        <input placeholder={`Avis de ${me?.name ?? "moi"} (critères du poste)`} value={mine.commentaire} onChange={(e) => setReview({ ...review, [c.id]: { ...mine, commentaire: e.target.value } })} />
                        <button className="ws-btn ws-btn-sm" onClick={() => void act("team_noter_candidat", { candidat_id: c.id, membre_id: memberId, ...mine }, "Avis enregistré")}>Noter</button>
                      </div>
                      <div className="ent-row">
                        {Object.entries(DECISION).map(([k, v]) => <button key={k} className="ws-btn ws-btn-sm" onClick={() => void act("team_decider_candidat", { candidat_id: c.id, decision: k }, `Décision : ${v}`)}>{v}</button>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="ws-btn ws-btn-sm ws-btn-ghost" onClick={() => setShowLow(!showLow)}>{showLow ? "Masquer" : "Afficher"} les {low.length} profil(s) sous le seuil</button>
            {showLow && (
              <table className="ws-table">
                <thead><tr><th>Candidat</th><th>Score</th><th>Manquant</th><th /></tr></thead>
                <tbody>
                  {low.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name} {c.relation !== "aucune" && <Badge tone="amber">{RELATIONS.find((r) => r.v === c.relation)?.l}</Badge>} {c.decision && <Badge tone="violet">{DECISION[c.decision]}</Badge>}</td>
                      <td>{c.score}/100</td>
                      <td className="ws-small">{c.missingRequired.join(", ") || "—"}</td>
                      <td><button className="ws-btn ws-btn-sm" onClick={() => void forceShortlist(c.id)}>Forcer en liste courte</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Card title="Importer une candidature">
              <div className="ent-form">
                <div className="ent-row">
                  <input placeholder="Nom du candidat *" value={cand.nom} onChange={(e) => setCand({ ...cand, nom: e.target.value })} />
                  <input placeholder="Email" value={cand.email} onChange={(e) => setCand({ ...cand, email: e.target.value })} />
                  <select value={cand.relation} onChange={(e) => setCand({ ...cand, relation: e.target.value })}>{RELATIONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}</select>
                  <select value={cand.recommande_par} onChange={(e) => setCand({ ...cand, recommande_par: e.target.value })}><option value="">Recommandé par… (aucun)</option>{snap.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                </div>
                <textarea rows={4} placeholder="Collez le texte du CV…" value={cand.cv_texte} onChange={(e) => setCand({ ...cand, cv_texte: e.target.value })} disabled={Boolean(file)} />
                <div className="ent-row">
                  <label className="ws-btn ws-btn-sm" style={{ flex: "none" }}><Upload size={13} /> {file ? file.name : "ou un CV PDF"}<input type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
                  <button className="ws-btn ws-btn-primary" style={{ flex: "none" }} disabled={!cand.nom.trim() || (!file && cand.cv_texte.trim().length < 30)} onClick={() => void importCv()}>Importer et noter</button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Card>

      <Card title="Conformité du recrutement" actions={<button className="ws-btn ws-btn-sm" disabled={busy === "team_conformite_recrutement"} onClick={async () => { const r = await act<Compliance>("team_conformite_recrutement", {}); if (r) setCompliance(r.data); }}><Scale size={13} /> Vérifier dans le corpus</button>}>
        {!compliance ? <p className="ent-muted">Droit du travail cité uniquement s&apos;il figure dans le corpus officiel ; sinon « non couvert ».</p> : (
          <div className="ws-stack">
            <div className={`ws-grounding ${compliance.droit_du_travail.statut === "non_couvert" ? "is-non-couvert" : "is-partiel"}`}><strong>{compliance.droit_du_travail.statut === "non_couvert" ? "⚠️ " : "⚖️ "}{compliance.droit_du_travail.libelle}</strong><small> — {compliance.droit_du_travail.detail}</small></div>
            {compliance.droit_du_travail.sources.length > 0 && <ArticleTable rows={compliance.droit_du_travail.sources} />}
            <div><b>Données personnelles des candidats :</b><BasisLine basis={compliance.fondement_juridique} /></div>
            <ul className="ent-list">{compliance.bonnes_pratiques.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        )}
      </Card>
    </div>
  );
}
