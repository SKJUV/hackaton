"use client";

import { Building2, FileSignature, ListChecks, Scale } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { TabProps } from "@/components/workspace/Tabs";
import { api, Badge, Card, Empty, ExampleBadge, fmtDate, fmtMoney } from "@/components/workspace/ui";
import type { FormId, LegalFormInfo } from "@/lib/modules/structure/catalog";
import type { Basis, GuideStep, Questionnaire, Recommendation, SimulationColumn, VestingRow } from "@/lib/modules/structure/service";

type State = {
  legalForm: string;
  forms: LegalFormInfo[];
  notice: string;
  choices: { id: string; at: string; chosen?: FormId; ranking: { form: FormId; score: number }[] }[];
  pactes: { id: string; at: string; documentId: string; associates: number; vestingMonths: number; cliffMonths: number }[];
  guides: { id: string; at: string; form: FormId; documentId: string; taskIds: string[] }[];
  members: { id: string; name: string; role: string }[];
};

type Section = "choix" | "simulateur" | "pacte" | "guide";
const SECTIONS: { id: Section; label: string; icon: typeof Scale }[] = [
  { id: "choix", label: "Choisir la structure", icon: Scale },
  { id: "simulateur", label: "Simulateur de création", icon: Building2 },
  { id: "pacte", label: "Pacte d'associés & vesting", icon: FileSignature },
  { id: "guide", label: "Guide d'immatriculation", icon: ListChecks },
];

function BasisLine({ basis }: { basis?: Basis }) {
  if (!basis) return null;
  const icon = basis.status === "fonde" ? "🟢" : basis.status === "partiel" ? "🟠" : "⚪";
  return <div className="ws-muted" title={basis.query}>{icon} {basis.label}</div>;
}

export default function StructurePanel({ snap, refresh, notify, goTo }: TabProps) {
  const companyId = snap.company.id;
  const [st, setSt] = useState<State | null>(null);
  const [section, setSection] = useState<Section>("choix");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<State>(`/api/structure?companyId=${companyId}`).then(setSt).catch((e) => notify(e instanceof Error ? e.message : "Erreur", "error")), [companyId, notify]);
  useEffect(() => void load(), [load]);

  async function post<T>(body: Record<string, unknown>, ok?: string): Promise<T | null> {
    setBusy(true);
    try {
      const r = await api<T>("/api/structure", "POST", { companyId, ...body });
      await load();
      await refresh();
      if (ok) notify(ok, "success");
      return r;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  if (!st) return <Empty>Chargement du module Structure…</Empty>;
  return (
    <div className="ws-stack">
      <div className="ws-info">
        <strong>Structure & création</strong> — forme juridique actuelle : <Badge tone="accent">{st.legalForm || "non définie"}</Badge>
        <div className="ws-muted">⚠️ {st.notice}</div>
      </div>
      <div className="st-tabs" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s.id} role="tab" aria-selected={section === s.id} className={`ws-btn ws-btn-sm ${section === s.id ? "ws-btn-primary" : ""}`} onClick={() => setSection(s.id)}>
            <s.icon size={14} /> {s.label}
          </button>
        ))}
      </div>
      {section === "choix" && <Chooser st={st} busy={busy} post={post} />}
      {section === "simulateur" && <Simulator st={st} busy={busy} post={post} />}
      {section === "pacte" && <Pacte st={st} busy={busy} post={post} goTo={goTo} />}
      {section === "guide" && <Guide st={st} busy={busy} post={post} goTo={goTo} />}
    </div>
  );
}

type Post = <T>(body: Record<string, unknown>, ok?: string) => Promise<T | null>;

function Chooser({ st, busy, post }: { st: State; busy: boolean; post: Post }) {
  const [q, setQ] = useState<Questionnaire>({ founders: Math.max(1, st.members.length), wantsInvestors: true, limitedLiability: true, budget: "moyen", wantsFlexibility: true, pooling: false });
  const [res, setRes] = useState<{ top: Recommendation[]; ranking: Recommendation[]; sector: Basis } | null>(null);
  const toggle = (k: keyof Questionnaire) => setQ({ ...q, [k]: !q[k] });
  return (
    <>
      <Card title="Questionnaire">
        <div className="st-form">
          <label>Nombre de fondateurs <input type="number" min={1} value={q.founders} onChange={(e) => setQ({ ...q, founders: Number(e.target.value) })} /></label>
          <label>Budget de création <select value={q.budget} onChange={(e) => setQ({ ...q, budget: e.target.value as Questionnaire["budget"] })}><option value="faible">faible</option><option value="moyen">moyen</option><option value="eleve">élevé</option></select></label>
          <label><input type="checkbox" checked={q.limitedLiability} onChange={() => toggle("limitedLiability")} /> Protéger mon patrimoine personnel</label>
          <label><input type="checkbox" checked={q.wantsInvestors} onChange={() => toggle("wantsInvestors")} /> Faire entrer des investisseurs</label>
          <label><input type="checkbox" checked={q.wantsFlexibility} onChange={() => toggle("wantsFlexibility")} /> Gouvernance souple</label>
          <label><input type="checkbox" checked={!!q.pooling} onChange={() => toggle("pooling")} /> Mutualiser des moyens entre entreprises existantes</label>
        </div>
        <button className="ws-btn ws-btn-primary" disabled={busy} onClick={async () => setRes(await post({ action: "recommander", questionnaire: q }))}>Recommander</button>
      </Card>
      {res && (
        <Card title="Recommandation" actions={<BasisLine basis={res.sector} />}>
          {res.top.map((r, i) => (
            <div key={r.form} className="st-reco">
              <strong>{i + 1}. {r.form}</strong> — {r.name} <Badge>score {r.score}</Badge>
              <ul>{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
              {r.cautions.length > 0 && <div className="ws-muted">Vigilance : {r.cautions.join(" ; ")}</div>}
              <BasisLine basis={r.basis} />
              <button className="ws-btn ws-btn-sm" disabled={busy} onClick={() => void post({ action: "choisir", form: r.form }, `Forme ${r.form} retenue`)}>Retenir cette forme</button>
            </div>
          ))}
          <div className="ws-muted">Non éligibles : {res.ranking.filter((r) => !r.eligible).map((r) => `${r.form} (${r.reasons[0]})`).join(", ") || "aucune"}</div>
        </Card>
      )}
      {st.choices.length > 0 && (
        <Card title="Décisions mémorisées">
          <ul>{st.choices.map((c) => <li key={c.id}>{fmtDate(c.at, true)} — {c.chosen ? <>retenue : <strong>{c.chosen}</strong></> : <>classement {c.ranking.slice(0, 3).map((r) => r.form).join(" > ")}</>}</li>)}</ul>
        </Card>
      )}
    </>
  );
}

function Simulator({ st, busy, post }: { st: State; busy: boolean; post: Post }) {
  const [forms, setForms] = useState<FormId[]>(["SARL", "SAS"]);
  const [cols, setCols] = useState<SimulationColumn[] | null>(null);
  const flip = (f: FormId) => setForms(forms.includes(f) ? forms.filter((x) => x !== f) : [...forms, f].slice(-4));
  return (
    <Card title={<>Comparer jusqu&apos;à 4 formes <ExampleBadge /></>}>
      <div className="ws-row">{st.forms.map((f) => <label key={f.id}><input type="checkbox" checked={forms.includes(f.id)} onChange={() => flip(f.id)} /> {f.id}</label>)}</div>
      <button className="ws-btn ws-btn-primary" disabled={busy || !forms.length} onClick={async () => setCols((await post<{ columns: SimulationColumn[] }>({ action: "simuler", forms }))?.columns ?? null)}>Simuler</button>
      {cols && (
        <div className="st-scroll">
          <table className="ws-table">
            <thead><tr><th>Critère</th>{cols.map((c) => <th key={c.form}>{c.form}</th>)}</tr></thead>
            <tbody>
              <tr><td>Coût de création (exemple)</td>{cols.map((c) => <td key={c.form}>{fmtMoney(c.exampleCostFcfa[0])} – {fmtMoney(c.exampleCostFcfa[1])}</td>)}</tr>
              <tr><td>Délai (exemple)</td>{cols.map((c) => <td key={c.form}>{c.exampleDelayDays[0]}–{c.exampleDelayDays[1]} jours</td>)}</tr>
              <tr><td>Dépôt de capital</td>{cols.map((c) => <td key={c.form}>{c.needsCapitalDeposit ? "oui" : "non"}</td>)}</tr>
              {cols[0].rows.map((row, i) => (
                <tr key={row.category}><td>{row.label}</td>{cols.map((c) => <td key={c.form}>{c.rows[i].repere}<BasisLine basis={c.rows[i].basis} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Pacte({ st, busy, post, goTo }: { st: State; busy: boolean; post: Post; goTo: (t: string) => void }) {
  const initial = st.members.slice(0, 4);
  const share = initial.length ? Math.round((100 / initial.length) * 100) / 100 : 50;
  const [rows, setRows] = useState(initial.length >= 2 ? initial.map((m, i) => ({ name: m.name, role: m.role, percent: i === 0 ? Math.round((100 - share * (initial.length - 1)) * 100) / 100 : share, vesting: true })) : [{ name: "Associé A (exemple)", role: "", percent: 50, vesting: true }, { name: "Associé B (exemple)", role: "", percent: 50, vesting: true }]);
  const [p, setP] = useState({ vestingMonths: 48, cliffMonths: 12, frequency: "mensuel" as "mensuel" | "trimestriel", lockUpMonths: 24, dragAlong: 75, preemption: true, tagAlong: true });
  const [schedule, setSchedule] = useState<VestingRow[] | null>(null);
  const total = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  const set = (i: number, k: string, v: unknown) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <>
      <Card title="Associés">
        {rows.map((r, i) => (
          <div key={i} className="ws-row">
            <input value={r.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Nom" />
            <input value={r.role} onChange={(e) => set(i, "role", e.target.value)} placeholder="Rôle" />
            <input type="number" value={r.percent} onChange={(e) => set(i, "percent", Number(e.target.value))} style={{ width: 90 }} /> %
            <label><input type="checkbox" checked={r.vesting} onChange={() => set(i, "vesting", !r.vesting)} /> vesting</label>
            {rows.length > 2 && <button className="ws-btn ws-btn-sm ws-btn-ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Retirer</button>}
          </div>
        ))}
        <div className="ws-row">
          <button className="ws-btn ws-btn-sm" onClick={() => setRows([...rows, { name: "", role: "", percent: 0, vesting: true }])}>+ Associé</button>
          <Badge tone={Math.abs(total - 100) < 0.01 ? "green" : "rose"}>Total {Math.round(total * 100) / 100} %</Badge>
        </div>
      </Card>
      <Card title="Clauses">
        <div className="st-form">
          <label>Durée du vesting (mois) <input type="number" value={p.vestingMonths} onChange={(e) => setP({ ...p, vestingMonths: Number(e.target.value) })} /></label>
          <label>Cliff (mois) <input type="number" value={p.cliffMonths} onChange={(e) => setP({ ...p, cliffMonths: Number(e.target.value) })} /></label>
          <label>Acquisition <select value={p.frequency} onChange={(e) => setP({ ...p, frequency: e.target.value as "mensuel" | "trimestriel" })}><option value="mensuel">mensuelle</option><option value="trimestriel">trimestrielle</option></select></label>
          <label>Lock-up (mois) <input type="number" value={p.lockUpMonths} onChange={(e) => setP({ ...p, lockUpMonths: Number(e.target.value) })} /></label>
          <label>Seuil drag-along (%) <input type="number" value={p.dragAlong} onChange={(e) => setP({ ...p, dragAlong: Number(e.target.value) })} /></label>
          <label><input type="checkbox" checked={p.preemption} onChange={() => setP({ ...p, preemption: !p.preemption })} /> Préemption</label>
          <label><input type="checkbox" checked={p.tagAlong} onChange={() => setP({ ...p, tagAlong: !p.tagAlong })} /> Tag-along</label>
        </div>
        <button className="ws-btn ws-btn-primary" disabled={busy} onClick={async () => {
          const r = await post<{ schedule: VestingRow[] }>({ action: "pacte", pacte: { ...p, associates: rows } }, "Pacte enregistré dans Documents (à relire)");
          if (r) setSchedule(r.schedule);
        }}>Générer le pacte</button>
      </Card>
      {schedule && (
        <Card title="Calendrier d'acquisition" actions={<button className="ws-btn ws-btn-sm" onClick={() => goTo("documents")}>Voir dans Documents</button>}>
          <table className="ws-table"><thead><tr><th>Échéance</th>{rows.map((r) => <th key={r.name}>{r.name}</th>)}</tr></thead>
            <tbody>{schedule.map((s) => <tr key={s.month}><td>{s.label}</td>{rows.map((r) => <td key={r.name}>{s.byAssociate[r.name.trim()]} %</td>)}</tr>)}</tbody></table>
        </Card>
      )}
      {st.pactes.length > 0 && <Card title="Pactes générés"><ul>{st.pactes.map((x) => <li key={x.id}>{fmtDate(x.at, true)} — {x.associates} associés, vesting {x.vestingMonths} mois / cliff {x.cliffMonths}</li>)}</ul></Card>}
    </>
  );
}

function Guide({ st, busy, post, goTo }: { st: State; busy: boolean; post: Post; goTo: (t: string) => void }) {
  const [form, setForm] = useState<FormId>((st.forms.find((f) => f.id === st.legalForm)?.id ?? "SARL") as FormId);
  const [tasks, setTasks] = useState(false);
  const [steps, setSteps] = useState<GuideStep[] | null>(null);
  return (
    <Card title={<>Parcours d&apos;immatriculation <ExampleBadge /></>}>
      <div className="ws-row">
        <select value={form} onChange={(e) => setForm(e.target.value as FormId)}>{st.forms.map((f) => <option key={f.id} value={f.id}>{f.id} — {f.name}</option>)}</select>
        <label><input type="checkbox" checked={tasks} onChange={() => setTasks(!tasks)} /> Créer les tâches</label>
        <button className="ws-btn ws-btn-primary" disabled={busy} onClick={async () => setSteps((await post<{ steps: GuideStep[] }>({ action: "guide", form, createTasks: tasks }, "Guide enregistré dans Documents"))?.steps ?? null)}>Générer le guide</button>
      </div>
      {steps && (
        <ol>
          {steps.map((s) => <li key={s.order}><strong>{s.title}</strong> <Badge>J+{s.exampleDelayDays} (exemple)</Badge><div>{s.detail}</div><BasisLine basis={s.basis} /></li>)}
        </ol>
      )}
      {steps && <div className="ws-row"><button className="ws-btn ws-btn-sm" onClick={() => goTo("documents")}>Documents</button>{tasks && <button className="ws-btn ws-btn-sm" onClick={() => goTo("taches")}>Tâches</button>}</div>}
      {st.guides.length > 0 && <div className="ws-muted">Guides déjà générés : {st.guides.map((g) => `${g.form} (${fmtDate(g.at)})`).join(", ")}</div>}
    </Card>
  );
}
