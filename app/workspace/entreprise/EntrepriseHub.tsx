"use client";

import { AlertTriangle, BarChart3, Briefcase, Database, Download, FileSpreadsheet, FolderArchive, Landmark, Radar, RefreshCw, Search, ShieldAlert, Upload, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, Badge, Card, Empty, ExampleBadge, Markdown } from "@/components/workspace/ui";
import type { Snapshot } from "@/lib/workspace/service";
import "./entreprise.css";

/* Types renvoyés par /api/entreprise (formes simplifiées côté client). */
type Kpi = { label: string; value: number; unit?: string; delta?: number | null; hint?: string };
type Dash = { domain: string; datasets: string[]; isExample: boolean; kpis: Kpi[]; series: { label: string; points: { period: string; value: number }[] }[]; breakdowns: { label: string; items: { name: string; value: number; share: number }[] }[] };
type Anomaly = { id: string; severity: string; domain: string; title: string; detail: string };
type DatasetSummary = { id: string; name: string; domain: string; rows: number; source: { kind: string; fileName: string; sheet?: string }; mapping: Record<string, string>; warnings: string[]; importedAt: string; isExample: boolean };
type DataView = { datasets: DatasetSummary[]; dashboards: Dash[]; anomalies: Anomaly[]; reports: { id: string; title: string; createdAt: string; trigger: string; documentId?: string }[]; isExample: boolean };
type Row = { period: string; revenue: number; expenses: number; net: number; balance: number };
type FinanceView = { currency: string; isExample: boolean; hasData: boolean; basis: string; settings: { openingCash: number; openingDate: string; safetyCash: number; fxShare: number; isExample: boolean }; currentCash: number; history: Row[]; forecast: Row[]; budget: { category: string; budget: number; actual: number; average: number; variancePct: number | null; status: string }[]; budgetLines: { category: string; monthly: number }[]; totals: { revenue12: number; expenses12: number; burnMonthly: number; runwayMonths: number | null; growthPct: number | null }; hypotheses: string[]; alerts: { severity: string; title: string; detail: string }[] };

const SUBTABS = [
  { id: "donnees", label: "Données", icon: Database },
  { id: "finance", label: "Tableau financier", icon: Wallet },
  { id: "veille", label: "Veille & risques", icon: Radar },
  { id: "dd", label: "Due diligence", icon: Search },
  { id: "dataroom", label: "Data room", icon: FolderArchive },
] as const;
type Sub = (typeof SUBTABS)[number]["id"];

const nf = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
const DOMAIN: Record<string, string> = { ventes: "Ventes", finances: "Finances", rh: "RH", clients: "Clients" };
const SEV: Record<string, { tone: "rose" | "amber" | "neutral" | "green"; label: string }> = { critique: { tone: "rose", label: "Critique" }, attention: { tone: "amber", label: "Attention" }, info: { tone: "neutral", label: "Info" }, positif: { tone: "green", label: "Positif" } };

type HubProps = { snap: Snapshot; notify: (text: string, type?: string) => void; refresh: () => void | Promise<void> };

export function EntrepriseHub(props: HubProps) {
  const [sub, setSub] = useState<Sub>("donnees");
  return (
    <div className="ws-stack">
      <div className="ent-subnav">
        {SUBTABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={sub === id ? "is-active" : ""} onClick={() => setSub(id)}><Icon size={14} /> {label}</button>
        ))}
      </div>
      {sub === "donnees" && <DataPanel {...props} />}
      {sub === "finance" && <FinancePanel {...props} />}
      {sub === "veille" && <VeillePanel {...props} />}
      {sub === "dd" && <DueDiligencePanel {...props} />}
      {sub === "dataroom" && <DataRoomPanel {...props} />}
    </div>
  );
}

function useView<T>(companyId: string, view: string, extra = "") {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<T>(`/api/entreprise?companyId=${encodeURIComponent(companyId)}&view=${view}${extra}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [companyId, view, extra]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}

const post = <T,>(companyId: string, action: string, body: Record<string, unknown> = {}) => api<T>("/api/entreprise", "POST", { companyId, action, ...body });
const exportUrl = (companyId: string, q: string) => `/api/entreprise/export?companyId=${encodeURIComponent(companyId)}&${q}`;

function Loading({ error, children }: { error: string; children?: ReactNode }) {
  return error ? <Card><p className="ws-error">{error}</p></Card> : <Card><p className="ws-muted">{children ?? "Chargement…"}</p></Card>;
}

function Kpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="ent-kpis">
      {kpis.map((k) => (
        <div key={k.label} className="ent-kpi">
          <small>{k.label}</small>
          <strong>{nf(k.value)}</strong> {k.unit && <span className="ws-muted">{k.unit}</span>}
          {k.delta !== undefined && k.delta !== null && <em className={k.delta >= 0 ? "ent-up" : "ent-down"}>{k.delta >= 0 ? "▲" : "▼"} {Math.abs(k.delta)} %</em>}
          {k.hint && <small>{k.hint}</small>}
        </div>
      ))}
    </div>
  );
}

function Bars({ points, height = 140 }: { points: { period: string; value: number }[]; height?: number }) {
  if (!points.length) return <Empty>Pas assez de données datées.</Empty>;
  const max = Math.max(...points.map((p) => Math.abs(p.value)), 1);
  return (
    <div className="ent-bars" style={{ height }}>
      {points.map((p) => (
        <div key={p.period} title={`${p.period} : ${nf(p.value)}`}>
          <span className={`bar ${p.value < 0 ? "is-neg" : ""}`} style={{ height: `${Math.max(2, (Math.abs(p.value) / max) * 100)}%` }} />
          <small>{p.period.slice(2)}</small>
        </div>
      ))}
    </div>
  );
}

function HBars({ items }: { items: { name: string; value: number; share: number }[] }) {
  return (
    <>
      {items.map((i) => (
        <div key={i.name} className="ent-hbar">
          <span title={i.name}>{i.name}</span>
          <div className="track"><div style={{ width: `${Math.min(100, i.share)}%` }} /></div>
          <small>{nf(i.value)} · {i.share} %</small>
        </div>
      ))}
    </>
  );
}

function SevItem({ severity, title, detail, extra }: { severity: string; title: ReactNode; detail?: ReactNode; extra?: ReactNode }) {
  const s = SEV[severity] ?? SEV.info;
  return (
    <div className={`ent-item ent-sev-${severity}`}>
      <Badge tone={s.tone}>{s.label}</Badge> <strong>{title}</strong> {extra}
      {detail && <p>{detail}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Données */

function DataPanel({ snap, notify, refresh }: HubProps) {
  const companyId = snap.company.id;
  const { data, error, reload } = useView<DataView>(companyId, "data");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 5 * 1024 * 1024) throw new Error(`${f.name} : 5 Mo maximum.`);
        const isXlsx = /\.xlsx?$|\.xlsm$/i.test(f.name);
        const body: Record<string, unknown> = { fileName: f.name, domain: domain || undefined };
        if (isXlsx) {
          const buf = new Uint8Array(await f.arrayBuffer());
          let bin = "";
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          body.base64 = btoa(bin);
        } else body.text = await f.text();
        const res = await post<DatasetSummary[]>(companyId, "import", body);
        notify(`${f.name} : ${res.map((d) => `${DOMAIN[d.domain]} (${d.rows} lignes)`).join(", ")}`);
      }
      await reload();
      void refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Import impossible", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      notify(ok);
      await reload();
      void refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Loading error={error} />;
  return (
    <div className="ws-stack">
      <Card title="Importer des données (CSV ou Excel .xlsx)" actions={data.isExample ? <ExampleBadge /> : null}>
        <div
          className={`ent-drop ${over ? "is-over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files); }}
        >
          <Upload size={20} /> <p>{busy ? "Traitement…" : "Glissez vos fichiers ventes, finances, RH ou clients ici, ou cliquez pour choisir (5 Mo max)."}</p>
          <input ref={input} type="file" accept=".csv,.txt,.xlsx,.xlsm" multiple hidden onChange={(e) => void upload(e.target.files)} />
        </div>
        <div className="ws-toolbar">
          <label className="ws-muted">Type de données :</label>
          <select value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="">Détection automatique</option>
            {Object.entries(DOMAIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {!snap.company.isExample && <button className="ws-btn ws-btn-sm" disabled={busy} onClick={() => void act(() => post(companyId, "charger_exemple"), "Jeu d'exemple chargé (fictif)")}>Charger un jeu d&apos;exemple</button>}
          <button className="ws-btn ws-btn-sm ws-btn-primary" disabled={busy} onClick={() => void act(() => post(companyId, "rapport"), "Rapport hebdomadaire généré (Documents)")}><FileSpreadsheet size={14} /> Générer le rapport exécutif hebdomadaire</button>
        </div>
        <p className="ent-src">Colonnes reconnues automatiquement (date, montant, client, produit, catégorie, type recette/dépense, débit/crédit, salaire, département, encours, jours de retard…). Les fichiers .xls (ancien format) doivent être enregistrés en .xlsx ou .csv.</p>
      </Card>

      <Card title={`Tables structurées (${data.datasets.length})`}>
        {data.datasets.length === 0 ? <Empty>Aucune donnée importée.</Empty> : (
          <div className="ent-table-wrap">
            <table className="ws-table">
              <thead><tr><th>Table</th><th>Type</th><th>Lignes</th><th>Colonnes reconnues</th><th>Avertissements</th><th /></tr></thead>
              <tbody>
                {data.datasets.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name} {d.isExample && <ExampleBadge />}<div className="ent-src">{d.source.fileName}{d.source.sheet ? ` › ${d.source.sheet}` : ""}</div></td>
                    <td>{DOMAIN[d.domain]}</td>
                    <td>{nf(d.rows)}</td>
                    <td className="ws-small">{Object.entries(d.mapping).map(([k, v]) => `${k} → ${v}`).join(" · ") || "—"}</td>
                    <td className="ws-small">{d.warnings.join(" ") || "—"}</td>
                    <td>{!d.id.startsWith("ds_seed_") && <button className="ws-btn ws-btn-sm ws-btn-ghost" disabled={busy} onClick={() => window.confirm(`Supprimer « ${d.name} » ?`) && void act(() => post(companyId, "supprimer_table", { datasetId: d.id }), "Table supprimée")}>Supprimer</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Anomalies détectées (${data.anomalies.length})`}>
        {data.anomalies.length ? data.anomalies.slice(0, 12).map((a) => <SevItem key={a.id} severity={a.severity} title={a.title} detail={a.detail} extra={<span className="ent-src">· {DOMAIN[a.domain]}</span>} />) : <Empty>Aucune anomalie.</Empty>}
      </Card>

      {data.dashboards.map((d) => (
        <Card key={d.domain} title={<><BarChart3 size={15} /> Tableau de bord — {DOMAIN[d.domain]}</>} actions={d.isExample ? <ExampleBadge /> : null}>
          <Kpis kpis={d.kpis} />
          {d.series.filter((s) => s.points.length).map((s) => <div key={s.label}><h4>{s.label}</h4><Bars points={s.points} /></div>)}
          <div className="ws-grid">
            {d.breakdowns.filter((b) => b.items.length).map((b) => <div key={b.label}><h4>{b.label}</h4><HBars items={b.items} /></div>)}
          </div>
        </Card>
      ))}

      <Card title={`Rapports exécutifs hebdomadaires (${data.reports.length})`}>
        {data.reports.length ? data.reports.map((r) => (
          <div key={r.id} className="ws-row">
            <Badge tone="accent">{new Date(r.createdAt).toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" })}</Badge> {r.title} <span className="ent-src">({r.trigger})</span>
            <a className="ws-link" href={exportUrl(companyId, `type=rapport&id=${r.id}&format=pdf`)}><Download size={13} /> PDF</a>
            <a className="ws-link" href={exportUrl(companyId, `type=rapport&id=${r.id}&format=md`)}>Markdown</a>
          </div>
        )) : <Empty>Aucun rapport. Générez-le ci-dessus ou demandez « rapport hebdomadaire » à l&apos;agent ; la future routine pourra le déclencher chaque semaine.</Empty>}
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- Finance */

function FinancePanel({ snap, notify }: HubProps) {
  const companyId = snap.company.id;
  const { data, error, reload } = useView<FinanceView>(companyId, "finance");
  const [form, setForm] = useState<{ openingCash: string; openingDate: string; safetyCash: string; fxShare: string } | null>(null);
  const [budget, setBudget] = useState<{ category: string; monthly: string }[] | null>(null);
  useEffect(() => {
    if (!data) return;
    setForm({ openingCash: String(data.settings.openingCash), openingDate: data.settings.openingDate, safetyCash: String(data.settings.safetyCash), fxShare: String(Math.round(data.settings.fxShare * 100)) });
    setBudget(data.budgetLines.map((b) => ({ category: b.category, monthly: String(b.monthly) })));
  }, [data]);

  async function save(action: string, body: Record<string, unknown>, ok: string) {
    try {
      await post(companyId, action, body);
      notify(ok);
      await reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    }
  }
  if (!data || !form || !budget) return <Loading error={error} />;
  const cur = data.currency;
  return (
    <div className="ws-stack">
      <Card title="Situation financière" actions={<>{data.isExample && <ExampleBadge />}<button className="ws-btn ws-btn-sm" onClick={() => void reload()}><RefreshCw size={13} /></button></>}>
        <Kpis kpis={[
          { label: "Trésorerie estimée", value: data.currentCash, unit: cur },
          { label: "Revenus (période)", value: data.totals.revenue12, unit: cur },
          { label: "Dépenses (période)", value: data.totals.expenses12, unit: cur },
          { label: "Consommation nette / mois", value: data.totals.burnMonthly, unit: cur },
          { label: "Autonomie", value: data.totals.runwayMonths ?? 0, unit: data.totals.runwayMonths === null ? "flux positifs" : "mois" },
        ]} />
        {!data.hasData && <p className="ws-notice">Aucune donnée financière : importez un journal de trésorerie ou un relevé (onglet Données).</p>}
      </Card>
      <Card title={`Alertes de risque de trésorerie (${data.alerts.length})`}>
        {data.alerts.length ? data.alerts.map((a) => <SevItem key={a.title} severity={a.severity} title={a.title} detail={a.detail} />) : <Empty>Aucune alerte.</Empty>}
      </Card>
      <div className="ws-grid">
        <Card title="Flux nets mensuels (historique)"><Bars points={data.history.map((h) => ({ period: h.period, value: h.net }))} /></Card>
        <Card title="Trésorerie prévisionnelle (solde fin de mois)"><Bars points={data.forecast.map((h) => ({ period: h.period, value: h.balance }))} /></Card>
      </div>
      <Card title="Prévision détaillée (6 mois)">
        <div className="ent-table-wrap">
          <table className="ws-table">
            <thead><tr><th>Mois</th><th>Recettes</th><th>Dépenses</th><th>Flux net</th><th>Solde</th></tr></thead>
            <tbody>{data.forecast.map((f) => <tr key={f.period} className={f.balance < 0 ? "is-late" : ""}><td>{f.period}</td><td>{nf(f.revenue)}</td><td>{nf(f.expenses)}</td><td>{nf(f.net)}</td><td><strong>{nf(f.balance)}</strong></td></tr>)}</tbody>
          </table>
        </div>
        <ul className="ent-src">{data.hypotheses.map((h) => <li key={h}>{h}</li>)}</ul>
      </Card>
      <Card title="Budget vs réalisé (dernier mois complet)">
        {data.budget.length ? (
          <table className="ws-table">
            <thead><tr><th>Poste</th><th>Budget mensuel</th><th>Réalisé</th><th>Moyenne 3 mois</th><th>Écart</th></tr></thead>
            <tbody>{data.budget.map((b) => <tr key={b.category}><td>{b.category}</td><td>{nf(b.budget)}</td><td>{nf(b.actual)}</td><td>{nf(b.average)}</td><td>{b.variancePct === null ? "—" : <Badge tone={b.status === "depassement" ? "rose" : b.status === "sous_consomme" ? "violet" : "green"}>{b.variancePct > 0 ? "+" : ""}{b.variancePct} %</Badge>}</td></tr>)}</tbody>
          </table>
        ) : <Empty>Aucun budget défini.</Empty>}
        <details>
          <summary className="ws-link">Modifier le budget</summary>
          {budget.map((b, i) => (
            <div key={i} className="ws-toolbar">
              <input value={b.category} placeholder="Poste" onChange={(e) => setBudget(budget.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} />
              <input value={b.monthly} type="number" min={0} placeholder="Montant mensuel" onChange={(e) => setBudget(budget.map((x, j) => (j === i ? { ...x, monthly: e.target.value } : x)))} />
              <button className="ws-btn ws-btn-sm ws-btn-ghost" onClick={() => setBudget(budget.filter((_x, j) => j !== i))}>Retirer</button>
            </div>
          ))}
          <div className="ws-toolbar">
            <button className="ws-btn ws-btn-sm" onClick={() => setBudget([...budget, { category: "", monthly: "0" }])}>+ Ligne</button>
            <button className="ws-btn ws-btn-sm ws-btn-primary" onClick={() => void save("budget", { lines: budget.map((b) => ({ category: b.category, monthly: Number(b.monthly) })) }, "Budget enregistré")}>Enregistrer le budget</button>
          </div>
        </details>
      </Card>
      <Card title="Paramètres de trésorerie" actions={data.settings.isExample ? <ExampleBadge /> : null}>
        <div className="ent-form">
          <label>Solde d&apos;ouverture ({cur})<input type="number" value={form.openingCash} onChange={(e) => setForm({ ...form, openingCash: e.target.value })} /></label>
          <label>Date du solde<input type="date" value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} /></label>
          <label>Seuil de sécurité ({cur})<input type="number" value={form.safetyCash} onChange={(e) => setForm({ ...form, safetyCash: e.target.value })} /></label>
          <label>Achats en devises (%)<input type="number" min={0} max={100} value={form.fxShare} onChange={(e) => setForm({ ...form, fxShare: e.target.value })} /></label>
          <button className="ws-btn ws-btn-primary" onClick={() => void save("parametres", { openingCash: Number(form.openingCash), openingDate: form.openingDate, safetyCash: Number(form.safetyCash), fxShare: Number(form.fxShare) / 100 }, "Paramètres enregistrés")}>Enregistrer</button>
        </div>
      </Card>
      <Card title="Exports de rapports">
        <div className="ws-grid">
          {[
            { cible: "investisseurs", label: "Investisseurs", icon: Briefcase, note: "KPI, historique, prévision, budget, risques" },
            { cible: "banque", label: "Banque", icon: Landmark, note: "Position, flux, prévision, stress tests" },
            { cible: "fisc", label: "Administration fiscale", icon: FileSpreadsheet, note: "CA, masse salariale, obligations citées du corpus (sinon « exemple »)" },
          ].map(({ cible, label, icon: Icon, note }) => (
            <div key={cible} className="ent-item">
              <strong><Icon size={14} /> {label}</strong>
              <p>{note}</p>
              <div className="ws-toolbar">
                <a className="ws-btn ws-btn-sm ws-btn-primary" href={exportUrl(companyId, `type=finance&cible=${cible}&format=pdf`)}><Download size={13} /> PDF</a>
                <a className="ws-btn ws-btn-sm" href={exportUrl(companyId, `type=finance&cible=${cible}&format=zip`)}>ZIP (PDF + CSV)</a>
                <a className="ws-btn ws-btn-sm ws-btn-ghost" href={exportUrl(companyId, `type=finance&cible=${cible}&format=md`)}>Markdown</a>
              </div>
            </div>
          ))}
        </div>
        {data.isExample && <p className="ws-notice"><AlertTriangle size={14} /> Les exports contiennent des données d&apos;exemple : ne pas les transmettre en l&apos;état.</p>}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------- Veille & risques */

type Watch = { profile: { sector: string; keywords: string[] }; regulatory: { title: string; source: string; matched: string[]; isNewOfficial: boolean; action: string }[]; publications: { title: string; source: string; matched: string[] }[]; signals: { id: string; title: string; impact: string; action: string; matched: string[] }[]; macro: { items: { id: string; label: string; year: string; value: number; source: string; url: string }[]; status: { live: boolean; error?: string; url: string } }; notes: string[] };
type Tenders = { live: { status: { live: boolean; error?: string; name: string; url: string }; matching: { id: string; title: string; buyer: string; deadline: string | null; url: string; matched: string[]; noticeType: string }[]; others: { id: string; title: string; deadline: string | null; url: string }[] }; archive: { label: string; items: { title: string; source: string; matched: string[] }[] }; examples: { id: string; title: string; buyer: string; deadline: string; amount: number; matched: string[] }[]; portals: { name: string; url: string; note: string }[] };
type Risk = { overall: number; level: string; isExample: boolean; axes: { id: string; label: string; score: number; level: string; drivers: string[]; strategies: string[]; basis: string; legal?: { statusLabel: string; status: string } }[]; alerts: { severity: string; title: string; detail: string }[] };
type Stress = { base: { currentCash: number; runwayMonths: number | null; isExample: boolean; currency: string }; results: { id: string; label: string; minBalance: number; minPeriod: string; endBalance: number; deltaEnd: number; breach: string | null; severity: string }[] };

const docLink = (source: string) => `/api/document?file=${encodeURIComponent(source)}`;

function VeillePanel({ snap }: HubProps) {
  const companyId = snap.company.id;
  const [keywords, setKeywords] = useState("");
  const [applied, setApplied] = useState("");
  const extra = applied ? `&keywords=${encodeURIComponent(applied)}` : "";
  const watch = useView<Watch>(companyId, "veille", extra);
  const tenders = useView<Tenders>(companyId, "appels", extra);
  const risk = useView<Risk>(companyId, "risques");
  const stress = useView<Stress>(companyId, "stress");
  const [custom, setCustom] = useState({ revenue: "20", costs: "0", fx: "0", delay: "0", lose: false });
  const [customRes, setCustomRes] = useState<Stress | null>(null);

  async function runCustom() {
    const r = await post<Stress>(companyId, "stress", { label: "Scénario personnalisé", revenueShock: -Math.abs(Number(custom.revenue)) / 100, expenseShock: Number(custom.costs) / 100, fxShock: Number(custom.fx) / 100, paymentDelayDays: Number(custom.delay), loseTopClient: custom.lose });
    setCustomRes(r);
  }
  const results = customRes?.results ?? stress.data?.results ?? [];
  return (
    <div className="ws-stack">
      <Card title="Profil de veille">
        <div className="ws-toolbar">
          <span className="ws-muted">Secteur : {snap.company.sector} · mots-clés : {(watch.data?.profile.keywords ?? snap.company.sectorKeywords).join(", ")}</span>
          <input placeholder="Mots-clés additionnels (séparés par des virgules)" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          <button className="ws-btn ws-btn-sm" onClick={() => setApplied(keywords)}>Filtrer</button>
        </div>
      </Card>

      {risk.data ? (
        <Card title={<><ShieldAlert size={15} /> Profil de risque — {risk.data.overall}/100 ({risk.data.level})</>} actions={risk.data.isExample ? <ExampleBadge /> : null}>
          {risk.data.alerts.map((a) => <SevItem key={a.title} severity={a.severity} title={a.title} detail={a.detail} />)}
          <div className="ent-risk">
            {risk.data.axes.map((a) => (
              <div key={a.id} className="ent-item">
                <strong>{a.label}</strong> <Badge tone={a.score >= 75 ? "rose" : a.score >= 55 ? "amber" : a.score >= 30 ? "accent" : "green"}>{a.score}/100</Badge> {a.basis === "exemple" && <ExampleBadge />}
                <div className="ent-gauge"><i style={{ left: `calc(${a.score}% - 2px)` }} /></div>
                <ul className="ws-small">{a.drivers.map((d) => <li key={d}>{d}</li>)}</ul>
                <details><summary className="ws-link">Stratégies de couverture</summary><ul className="ws-small">{a.strategies.map((s) => <li key={s}>{s}</li>)}</ul></details>
                {a.legal && <p className="ent-src">⚖️ {a.legal.statusLabel}</p>}
              </div>
            ))}
          </div>
        </Card>
      ) : <Loading error={risk.error}>Calcul du profil de risque…</Loading>}

      <Card title="Simulation de stress (trésorerie, 6 mois)" actions={stress.data?.base.isExample ? <ExampleBadge /> : null}>
        <div className="ent-form">
          <label>Baisse des ventes (%)<input type="number" value={custom.revenue} onChange={(e) => setCustom({ ...custom, revenue: e.target.value })} /></label>
          <label>Hausse des coûts (%)<input type="number" value={custom.costs} onChange={(e) => setCustom({ ...custom, costs: e.target.value })} /></label>
          <label>Choc de change (%)<input type="number" value={custom.fx} onChange={(e) => setCustom({ ...custom, fx: e.target.value })} /></label>
          <label>Retards de paiement (jours)<input type="number" value={custom.delay} onChange={(e) => setCustom({ ...custom, delay: e.target.value })} /></label>
          <label><span><input type="checkbox" checked={custom.lose} onChange={(e) => setCustom({ ...custom, lose: e.target.checked })} /> Perte du premier client</span></label>
          <button className="ws-btn ws-btn-primary" onClick={() => void runCustom()}>Simuler</button>
        </div>
        {results.length ? (
          <table className="ws-table">
            <thead><tr><th>Scénario</th><th>Solde minimum</th><th>Mois</th><th>Écart fin d&apos;horizon</th><th>Rupture</th></tr></thead>
            <tbody>{results.map((r) => <tr key={r.id}><td>{r.label}</td><td>{nf(r.minBalance)}</td><td>{r.minPeriod}</td><td className={r.deltaEnd < 0 ? "ent-down" : ""}>{nf(r.deltaEnd)}</td><td>{r.breach ? <Badge tone="rose">{r.breach}</Badge> : <Badge tone="green">non</Badge>}</td></tr>)}</tbody>
          </table>
        ) : <Loading error={stress.error} />}
      </Card>

      <Card title="Alertes d'appels d'offres publics">
        {!tenders.data ? <p className="ws-muted">{tenders.error || "Interrogation des sources…"}</p> : (
          <>
            <h4>Source réelle : {tenders.data.live.status.name} {tenders.data.live.status.live ? <Badge tone="green">en direct</Badge> : <Badge tone="amber">indisponible{tenders.data.live.status.error ? ` — ${tenders.data.live.status.error}` : ""}</Badge>}</h4>
            {tenders.data.live.matching.length ? tenders.data.live.matching.map((t) => <SevItem key={t.id} severity="attention" title={<a href={t.url} target="_blank" rel="noreferrer">{t.title}</a>} detail={`${t.buyer} · ${t.noticeType} · échéance ${t.deadline ?? "non précisée"} · mots : ${t.matched.join(", ")}`} />) : <Empty>Aucun avis ouvert ne correspond au profil pour l&apos;instant.</Empty>}
            {tenders.data.live.others.length > 0 && <details><summary className="ws-link">Autres avis ouverts au Cameroun ({tenders.data.live.others.length})</summary>{tenders.data.live.others.map((t) => <div key={t.id} className="ws-row"><a href={t.url} target="_blank" rel="noreferrer">{t.title}</a> <span className="ent-src">· {t.deadline ?? "—"}</span></div>)}</details>}
            <h4>{tenders.data.archive.label}</h4>
            {tenders.data.archive.items.slice(0, 5).map((a) => <div key={a.source} className="ws-row"><a href={docLink(a.source)} target="_blank" rel="noreferrer">{a.title}</a> {a.matched.length > 0 && <Badge tone="accent">{a.matched.join(", ")}</Badge>}</div>)}
            <h4>Exemples (fictifs) correspondant au profil</h4>
            {tenders.data.examples.length ? tenders.data.examples.map((t) => <div key={t.id} className="ws-row"><ExampleBadge /> {t.title} <span className="ent-src">· {t.buyer} · {t.deadline} · {nf(t.amount)} XAF</span></div>) : <Empty>Aucun exemple pour ce profil.</Empty>}
            <h4>Portails officiels nationaux</h4>
            {tenders.data.portals.map((p) => <div key={p.url} className="ws-row"><a href={p.url} target="_blank" rel="noreferrer">{p.name}</a> <span className="ent-src">— {p.note}</span></div>)}
          </>
        )}
      </Card>

      <Card title="Veille sectorielle filtrée">
        {!watch.data ? <p className="ws-muted">{watch.error || "Chargement…"}</p> : (
          <>
            <h4>Textes officiels pertinents (veille réglementaire)</h4>
            {watch.data.regulatory.length ? watch.data.regulatory.map((a) => <SevItem key={a.source} severity={a.isNewOfficial ? "attention" : "info"} title={<a href={docLink(a.source)} target="_blank" rel="noreferrer">{a.title}</a>} detail={`${a.action} · mots : ${a.matched.join(", ")}`} />) : <Empty>Aucun texte (index du corpus absent ? npm run index-documents).</Empty>}
            <h4>Publications du régulateur</h4>
            {watch.data.publications.map((p) => <div key={p.source} className="ws-row"><a href={docLink(p.source)} target="_blank" rel="noreferrer">{p.title}</a> <span className="ent-src">· {p.matched.join(", ")}</span></div>)}
            <h4>Signaux de marché</h4>
            {watch.data.signals.length ? watch.data.signals.map((s) => <div key={s.id} className="ent-item"><ExampleBadge /> <strong>{s.title}</strong><p>{s.impact} → {s.action}</p></div>) : <Empty>Aucun signal pour ce profil.</Empty>}
            <h4>Indicateurs macroéconomiques {watch.data.macro.status.live ? <Badge tone="green">Banque mondiale — réel</Badge> : <Badge tone="amber">indisponible</Badge>}</h4>
            {watch.data.macro.items.map((m) => <div key={m.id} className="ws-row">{m.label} : <strong>{m.value}</strong> ({m.year}) <a className="ent-src" href={m.url} target="_blank" rel="noreferrer">source</a></div>)}
            <ul className="ent-src">{watch.data.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Due diligence */

type Cp = { id: string; name: string; kind: string; country: string; city?: string; isExample: boolean; fromDirectory: boolean };
type DD = { counterparty: { id: string; name: string; kind: string; country: string }; score: number; verdict: string; signals: { severity: string; label: string; source: string }[]; checklist: { id: string; label: string; status: string; statusLabel: string; sources: { document: string; page: number; articles: string[]; file: string; isExample: boolean; excerpt: string }[] }[]; missing: string[]; limits: string[]; isExample: boolean };

function DueDiligencePanel({ snap, notify }: HubProps) {
  const companyId = snap.company.id;
  const list = useView<Cp[]>(companyId, "contreparties");
  const [dd, setDd] = useState<DD | null>(null);
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ name: "", kind: "partenaire", country: "Cameroun", city: "", registration: "", yearsActive: "", notes: "" });
  const [filter, setFilter] = useState("");

  async function analyze(id: string) {
    setBusy(id);
    try {
      setDd(await post<DD>(companyId, "due_diligence", { id }));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setBusy("");
    }
  }
  async function add() {
    try {
      const cp = await post<{ id: string }>(companyId, "contrepartie", { ...form, yearsActive: form.yearsActive === "" ? undefined : Number(form.yearsActive) });
      notify("Contrepartie ajoutée");
      setForm({ ...form, name: "", registration: "", yearsActive: "", notes: "" });
      await list.reload();
      void analyze(cp.id);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    }
  }
  const items = (list.data ?? []).filter((c) => !filter || `${c.name} ${c.kind}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="ws-split">
      <div className="ws-stack">
        <Card title="Contreparties">
          <input className="ws-search" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {!list.data ? <p className="ws-muted">{list.error || "Chargement…"}</p> : items.map((c) => (
            <div key={c.id} className="ws-row">
              <Badge tone="accent">{c.kind}</Badge> {c.name} {c.isExample && <ExampleBadge />}
              <button className="ws-btn ws-btn-sm" disabled={busy === c.id} onClick={() => void analyze(c.id)}>{busy === c.id ? "…" : "Analyser"}</button>
            </div>
          ))}
        </Card>
        <Card title="Ajouter une contrepartie">
          <div className="ent-form">
            <label>Nom<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Type<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{["partenaire", "fournisseur", "client", "investisseur"].map((k) => <option key={k}>{k}</option>)}</select></label>
            <label>Pays<input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></label>
            <label>Immatriculation (RCCM…)<input value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} /></label>
            <label>Ancienneté (années)<input type="number" min={0} value={form.yearsActive} onChange={(e) => setForm({ ...form, yearsActive: e.target.value })} /></label>
          </div>
          <textarea placeholder="Signaux connus, une ligne par signal (litige, retards, références…)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          <button className="ws-btn ws-btn-primary" disabled={!form.name.trim()} onClick={() => void add()}>Ajouter et analyser</button>
        </Card>
      </div>
      <div className="ws-stack">
        {!dd ? <Card><Empty>Sélectionnez une contrepartie pour générer sa fiche de signaux et sa checklist juridique citée.</Empty></Card> : (
          <Card title={`Fiche — ${dd.counterparty.name}`} actions={<>{dd.isExample && <ExampleBadge />}<a className="ws-btn ws-btn-sm" href={exportUrl(companyId, `type=dd&id=${encodeURIComponent(dd.counterparty.id === "adhoc" ? "" : dd.counterparty.id)}&name=${encodeURIComponent(dd.counterparty.name)}&format=pdf`)}><Download size={13} /> PDF</a></>}>
            <p>Score de confiance : <strong>{dd.score}/100</strong> — <Badge tone={dd.verdict === "favorable" ? "green" : dd.verdict === "vigilance" ? "amber" : "rose"}>{dd.verdict}</Badge></p>
            <h4>Signaux</h4>
            {dd.signals.map((s, i) => <SevItem key={i} severity={s.severity} title={s.label} detail={`Source : ${s.source}`} />)}
            {dd.missing.length > 0 && <><h4>Informations manquantes</h4><ul className="ws-small">{dd.missing.map((m) => <li key={m}>{m}</li>)}</ul></>}
            <h4>Checklist juridique (corpus officiel)</h4>
            {dd.checklist.map((c) => (
              <div key={c.id} className={`ent-item ent-sev-${c.status === "non_couvert" ? "attention" : "positif"}`}>
                <strong>☐ {c.label}</strong>
                <p>{c.status === "non_couvert" ? "⚠️ " : "⚖️ "}{c.statusLabel}</p>
                {c.status !== "non_couvert" && c.sources.map((s) => <p key={`${s.file}${s.page}`} className="ent-src"><a href={docLink(s.file)} target="_blank" rel="noreferrer">{s.document}</a>, p. {s.page}{s.articles.length ? `, art. ${s.articles.slice(0, 3).join(", ")}` : ""} — « {s.excerpt.slice(0, 160)}… »</p>)}
              </div>
            ))}
            <ul className="ent-src">{dd.limits.map((l) => <li key={l}>{l}</li>)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Data room */

type DataRoom = { company: string; generatedAt: string; score: number; scoreDetail: { label: string; points: number; max: number; detail: string }[]; sections: { id: string; title: string; status: string; file: string; markdown: string; note?: string }[]; csv: string[]; isExample: boolean };

function DataRoomPanel({ snap }: HubProps) {
  const companyId = snap.company.id;
  const { data, error, reload, loading } = useView<DataRoom>(companyId, "dataroom");
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Loading error={error}>Génération de la data room…</Loading>;
  return (
    <div className="ws-stack">
      <Card title={`Data room investisseur — score de préparation ${data.score}/100`} actions={<>{data.isExample && <ExampleBadge />}<button className="ws-btn ws-btn-sm" disabled={loading} onClick={() => void reload()}><RefreshCw size={13} /> Régénérer</button></>}>
        <div className="ws-score-detail">
          {data.scoreDetail.map((s) => (
            <div key={s.label} className="ws-bar">
              <div className="ws-bar-label"><span>{s.label}</span><span>{s.points}/{s.max}</span></div>
              <div className="ws-bar-track"><div style={{ width: `${(s.points / s.max) * 100}%` }} /></div>
              <small>{s.detail}</small>
            </div>
          ))}
        </div>
        <div className="ws-toolbar">
          <a className="ws-btn ws-btn-primary" href={exportUrl(companyId, "type=dataroom&format=zip")}><Download size={14} /> Exporter en ZIP</a>
          <a className="ws-btn" href={exportUrl(companyId, "type=dataroom&format=pdf")}><Download size={14} /> Exporter en PDF</a>
        </div>
        {data.isExample && <p className="ws-notice"><AlertTriangle size={14} /> Contient des données d&apos;exemple : ne pas transmettre en l&apos;état à un investisseur.</p>}
      </Card>
      <Card title="Contenu">
        {data.sections.map((s) => (
          <div key={s.id}>
            <div className="ws-row">
              <Badge tone={s.status === "present" ? "green" : s.status === "partiel" ? "amber" : "rose"}>{s.status === "present" ? "Présent" : s.status === "partiel" ? "Partiel" : "Manquant"}</Badge>
              <strong>{s.title}</strong> <span className="ent-src">{s.file}{s.note ? ` · ${s.note}` : ""}</span>
              <button className="ws-link" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Masquer" : "Aperçu"}</button>
            </div>
            {open === s.id && <div className="ent-item"><Markdown text={s.markdown} /></div>}
          </div>
        ))}
        <p className="ent-src">Fichiers chiffrés inclus : {data.csv.join(", ")}.</p>
      </Card>
    </div>
  );
}
