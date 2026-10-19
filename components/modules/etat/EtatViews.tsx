"use client";

import { AlertTriangle, BarChart3, Calculator, ExternalLink, Globe2, Megaphone, Siren, Users } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, Badge, Card, Empty, ExampleBadge } from "@/components/workspace/ui";
import type { TabProps } from "@/components/workspace/Tabs";
import type { MacroDashboard } from "@/lib/modules/etat/macro";
import type { assessCrises, CommunicationPlan } from "@/lib/modules/etat/crisis";
import type { CitizenAdvice } from "@/lib/modules/etat/citizen";
import type { PolicySimulation, MEASURES as MeasuresConst, ASSUMPTION_INFO as AssumptionInfoConst, Assumptions } from "@/lib/modules/etat/policy";
import type { LegalRefs } from "@/lib/modules/etat/legal";
import "./etat.css";

type Props = Pick<TabProps, "snap" | "notify" | "goTo">;
/** Les 4 onglets du niveau État (ids réservés dans module-catalog.tsx). */
type Sub = "macro" | "crise" | "citizen" | "policy";
const SUBS: { id: Sub; label: string; icon: typeof BarChart3 }[] = [
  { id: "macro", label: "Tableau macro", icon: BarChart3 },
  { id: "crise", label: "Crise & communication", icon: Siren },
  { id: "citizen", label: "Économie citoyenne", icon: Users },
  { id: "policy", label: "Simulateur de politiques", icon: Calculator },
];

const sign = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);

/** Bandeau obligatoire sur chaque écran du niveau État. */
export function DemoBanner() {
  return (
    <div className="etat-banner" role="note">
      <AlertTriangle size={15} /> <strong>Démo — données fictives</strong>
      <span>Les valeurs simulées ne sont ni officielles ni des prévisions. Seule la couche « Banque mondiale », quand elle est activée, contient des données réelles (sourcées et datées).</span>
    </div>
  );
}

function Spark({ values, tone = "accent" }: { values: number[]; tone?: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / (max - min || 1)) * 26}`).join(" ");
  return (
    <svg className={`etat-spark is-${tone}`} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Bar({ value, max, negative }: { value: number; max: number; negative?: boolean }) {
  const w = Math.min(100, (Math.abs(value) / (max || 1)) * 100);
  return <div className="etat-bar"><div className={negative ?? value < 0 ? "is-neg" : "is-pos"} style={{ width: `${w}%` }} /></div>;
}

function LegalBox({ legal }: { legal: LegalRefs | undefined }) {
  if (!legal) return null;
  const off = legal.sources.filter((s) => !s.isExample);
  return (
    <Card title="Références juridiques (corpus officiel)" actions={<Badge tone={legal.statut === "fonde" ? "green" : legal.statut === "partiel" ? "amber" : "rose"}>{legal.statut === "non_couvert" ? "Non couvert" : legal.statut === "partiel" ? "Partiel" : "Fondé"}</Badge>}>
      <p className="ws-small">{legal.statut === "non_couvert" ? "⚠️ Non couvert par le corpus officiel : aucun texte disponible ne traite précisément ce point. Aucune règle n'est inventée." : `⚖️ ${legal.libelle}`}</p>
      {off.map((s) => (
        <div key={s.id} className="ws-row ws-small">
          <Badge tone="accent">{s.id}</Badge> {s.document}, p. {s.page}{s.articles.length ? `, art. ${s.articles.slice(0, 3).join(", ")}` : ""}
          {s.file.endsWith(".pdf") && <a className="ws-link" href={`/api/document?file=${encodeURIComponent(s.file)}#page=${s.page}`} target="_blank" rel="noreferrer">PDF <ExternalLink size={11} /></a>}
        </div>
      ))}
      {legal.sources.filter((s) => s.isExample).map((s) => <div key={s.id} className="ws-row ws-small"><ExampleBadge /> Texte d&apos;exemple, non officiel — {s.document}</div>)}
    </Card>
  );
}

/** Cadre commun des 4 onglets État : bandeau démo obligatoire + navigation entre les onglets du niveau. */
export function EtatFrame({ current, goTo, children }: { current: Sub; goTo: TabProps["goTo"]; children: ReactNode }) {
  return (
    <div className="ws-stack etat-root">
      <DemoBanner />
      <div className="etat-subtabs">
        {SUBS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={current === id ? "is-active" : ""} onClick={() => goTo(id)}><Icon size={14} /> {label}</button>
        ))}
        <Badge tone="violet" title="Niveau 3 du produit">Niveau État</Badge>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- Macro */

export function Macro({ notify }: Pick<Props, "notify">) {
  const [real, setReal] = useState(false);
  const [region, setRegion] = useState("");
  const [d, setD] = useState<(MacroDashboard & { tensionFormula: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setD(await api(`/api/etat/macro?${new URLSearchParams({ ...(real ? { reel: "1" } : {}), ...(region ? { region } : {}) })}`));
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setLoading(false);
    }
  }, [real, region, notify]);
  useEffect(() => void load(), [load]);
  if (!d) return <Card><p>Chargement…</p></Card>;
  const maxTension = Math.max(...d.regions.map((r) => r.tension));
  return (
    <>
      <div className="ws-toolbar">
        <label className="etat-toggle"><input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} /> <Globe2 size={14} /> Couche réelle (API Banque mondiale)</label>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Toutes les régions</option>
          {d.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {loading && <span className="ws-muted">Mise à jour…</span>}
      </div>
      {d.earlyWarnings.length > 0 && (
        <Card title="Alertes précoces (démo)">
          {d.earlyWarnings.map((w) => <div key={w.indicator} className="ws-row ws-small"><Badge tone={w.level === "alerte" ? "rose" : "amber"}>{w.level}</Badge> {w.message}</div>)}
        </Card>
      )}
      <div className="ws-grid">
        {d.kpis.map((k) => (
          <Card key={k.id} title={<>{k.label} <ExampleBadge /></>}>
            <div className="etat-kpi"><strong>{fmt(k.latest)}</strong> <small>{k.unit}</small></div>
            <Spark values={k.values} tone={k.tone === "defavorable" ? "rose" : k.tone === "favorable" ? "green" : "accent"} />
            <p className="ws-small ws-muted">Sur 3 périodes : {sign(k.change3)} ({k.trend}) · {k.description}</p>
          </Card>
        ))}
      </div>
      {d.focus && <Card title={`Focus : ${d.focus.region} (démo)`}>{d.focus.highlights.map((h) => <div key={h} className="ws-row ws-small">{h}</div>)}</Card>}
      <Card title="Granularité régionale (seed fictif)" actions={<ExampleBadge />}>
        <p className="ws-small ws-muted">Indice de tension : {d.tensionFormula}. Prix de marché simulés (données terrain fictives).</p>
        <table className="ws-table">
          <thead><tr><th>Région</th><th>Tension</th><th>Indice prix</th><th>Inflation alim.</th><th>Emploi informel</th><th>Maïs / riz / huile (FCFA)</th></tr></thead>
          <tbody>
            {d.regions.map((r) => (
              <tr key={r.id} className={r.id === region ? "is-best" : ""}>
                <td>{r.rank}. {r.name}</td>
                <td><Bar value={r.tension} max={maxTension} negative /> {r.tension}</td>
                <td>{r.priceIndex}</td>
                <td>{r.foodInflation} %</td>
                <td>{r.informalShare} %</td>
                <td>{r.market.mais_kg} / {r.market.riz_kg} / {r.market.huile_l}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Production sectorielle (indice fictif, base 100)" actions={<ExampleBadge />}>
        <table className="ws-table">
          <thead><tr><th>Secteur</th><th>Indice</th><th>3 périodes</th><th>Part du PIB (fictive)</th><th>Part informelle (fictive)</th><th>Tendance</th></tr></thead>
          <tbody>{d.sectors.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.latest}</td><td>{sign(s.change3)}</td><td>{Math.round(s.gdpShare * 100)} %</td><td>{Math.round(s.informalShare * 100)} %</td><td style={{ width: 120 }}><Spark values={s.values} /></td></tr>)}</tbody>
        </table>
      </Card>
      <RealLayer layer={d.realLayer} enabled={real} />
    </>
  );
}

function RealLayer({ layer, enabled }: { layer: MacroDashboard["realLayer"]; enabled: boolean }) {
  if (!enabled) return <p className="ws-small ws-muted">Couche réelle désactivée : activez-la pour afficher des indicateurs publics de la Banque mondiale (source et date citées), séparés des données de démo.</p>;
  if (!layer) return null;
  if (layer.status !== "ok")
    return <Card title="Couche réelle — Banque mondiale" actions={<Badge tone="amber">{layer.status}</Badge>}><p className="ws-small">Source indisponible ({layer.reason}) : l&apos;écran reste sur les données de démo.</p></Card>;
  return (
    <Card title="Couche réelle — Banque mondiale (API Indicateurs v2)" actions={<Badge tone="green">Données réelles</Badge>}>
      <p className="ws-small ws-muted">
        Récupéré le {new Date(layer.fetchedAt).toLocaleString("fr-FR", { timeZone: "Africa/Douala" })} (heure de Douala) · API vérifiée le {layer.verifiedOn} · <a className="ws-link" href={layer.docUrl} target="_blank" rel="noreferrer">documentation <ExternalLink size={11} /></a>
      </p>
      <table className="ws-table">
        <thead><tr><th>Indicateur</th><th>Pays</th><th>Valeurs (année)</th><th>Mise à jour API</th><th>Source</th></tr></thead>
        <tbody>
          {layer.series.map((s) => (
            <tr key={s.code}>
              <td>{s.label}<br /><small className="ws-muted">{s.code} · {s.unit}{s.note ? ` · ${s.note}` : ""}</small></td>
              <td>{s.countryName}</td>
              <td>{s.points.map((p) => `${p.year} : ${fmt(p.value)}`).join(" · ")}</td>
              <td>{s.lastUpdated ?? "—"}</td>
              <td><a className="ws-link" href={s.sourceUrl} target="_blank" rel="noreferrer">JSON <ExternalLink size={11} /></a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {layer.errors.length > 0 && <p className="ws-small ws-muted">Indicateurs non récupérés : {layer.errors.join(" ; ")}</p>}
    </Card>
  );
}

/* ------------------------------------------------------------- Crise */

type CrisisData = ReturnType<typeof assessCrises> & { plan: CommunicationPlan; legal: LegalRefs };
const LEVEL_TONE = { faible: "green", vigilance: "amber", eleve: "rose", critique: "rose" } as const;

export function Crisis({ snap, notify, goTo }: Props) {
  const [type, setType] = useState("approvisionnement");
  const [profils, setProfils] = useState<string[]>([]);
  const [d, setD] = useState<CrisisData | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<CrisisData>(`/api/etat/crise?type=${type}&profils=${profils.join(",")}`).then(setD).catch((e: Error) => notify(e.message, "error"));
  }, [type, profils, notify]);
  async function communique() {
    setBusy(true);
    try {
      const r = await api<{ approvalId: string | null }>("/api/etat/crise/communique", "POST", { companyId: snap.company.id, type, profil: profils.length === 1 ? profils[0] : undefined, destinataires: to });
      notify(r.approvalId ? "Communiqué enregistré ; email placé dans la file d'approbation" : "Projet de communiqué enregistré dans Documents (à valider)");
      if (r.approvalId) goTo("approbations");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    } finally {
      setBusy(false);
    }
  }
  if (!d) return <Card><p>Chargement…</p></Card>;
  const allProfiles = ["agriculteur", "famille", "artisan", "commercant", "transporteur"];
  return (
    <>
      <div className="ws-grid">
        {d.alerts.map((a) => (
          <Card key={a.type} title={a.label} actions={<Badge tone={LEVEL_TONE[a.level]}>{a.level} · {a.score}/100</Badge>}>
            <div className="ws-progress"><div style={{ width: `${a.score}%` }} /></div>
            <p className="ws-small"><strong>Fenêtre d&apos;action :</strong> {a.actionWindow.label}</p>
            {a.drivers.map((x) => <div key={x.id} className="ws-row ws-small">{x.label} : {fmt(x.value)} {x.unit} <Badge tone="neutral">score {x.score} × {x.weight}</Badge></div>)}
            <ul className="ws-recos">{a.preventiveActions.map((p) => <li key={p}>{p}</li>)}</ul>
          </Card>
        ))}
      </div>
      <Card title="Indicateurs précurseurs (seuils d'exemple)" actions={<ExampleBadge />}>
        <p className="ws-small ws-muted">{d.method}</p>
        <table className="ws-table">
          <thead><tr><th>Indicateur</th><th>Valeur</th><th>Vigilance</th><th>Critique</th><th>Score</th><th>Périodes avant le seuil critique</th><th>Évolution</th></tr></thead>
          <tbody>{d.indicators.map((i) => <tr key={i.id} className={i.score >= 80 ? "is-late" : ""}><td>{i.label}</td><td>{fmt(i.latest)} {i.unit}</td><td>{i.vigilance}</td><td>{i.critical}</td><td>{i.score}</td><td>{i.periodsToCritical === null ? "—" : i.periodsToCritical === 0 ? "franchi" : i.periodsToCritical}</td><td style={{ width: 110 }}><Spark values={i.values} tone={i.score >= 50 ? "rose" : "accent"} /></td></tr>)}</tbody>
        </table>
      </Card>
      <Card title={<><Megaphone size={15} /> Plan de communication citoyenne — {d.plan.crisisLabel}</>}>
        <div className="ws-toolbar">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="approvisionnement">Crise d&apos;approvisionnement</option>
            <option value="change">Crise de change</option>
            <option value="matieres_premieres">Choc matières premières</option>
          </select>
          {allProfiles.map((p) => (
            <label key={p} className="etat-toggle"><input type="checkbox" checked={profils.includes(p)} onChange={(e) => setProfils(e.target.checked ? [...profils, p] : profils.filter((x) => x !== p))} /> {p}</label>
          ))}
        </div>
        <div className="etat-cols">
          <div>
            <h4>Guidance anti-panique</h4>
            <ul className="ws-recos">{d.plan.antiPanic.map((x) => <li key={x}>{x}</li>)}</ul>
            <h4>Calendrier</h4>
            {d.plan.timeline.map((t) => <div key={t.when} className="ws-row ws-small"><Badge tone="accent">{t.when}</Badge> {t.action}</div>)}
            <h4>Canaux</h4>
            {d.plan.channels.map((c) => <div key={c.channel} className="ws-row ws-small"><strong>{c.channel}</strong> — {c.why}</div>)}
          </div>
          <div>
            {d.plan.segments.map((s) => (
              <details key={s.profile} className="etat-segment" open={d.plan.segments.length <= 2}>
                <summary><strong>{s.label}</strong> — {s.keyMessage}</summary>
                <p className="ws-small"><strong>Stock raisonnable :</strong> {s.stock.join(" ")}</p>
                <p className="ws-small"><strong>Consommation :</strong> {s.consommation.join(" ")}</p>
                <ul className="ws-recos">{s.conseils.map((c) => <li key={c}>{c}</li>)}</ul>
                {s.aides.map((a) => <div key={a.name} className="ws-row ws-small"><ExampleBadge /> {a.name} — {a.benefit}</div>)}
              </details>
            ))}
          </div>
        </div>
        <div className="ws-toolbar">
          <input className="ws-grow" placeholder="Destinataires facultatifs (cellule de communication), séparés par des virgules" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="ws-btn ws-btn-primary" disabled={busy} onClick={() => void communique()}>Préparer le communiqué</button>
        </div>
        <p className="ws-small ws-muted">Le communiqué est enregistré dans Documents « à valider ». Avec des destinataires, un email est préparé et attend votre validation dans Approbations : rien n&apos;est diffusé automatiquement.</p>
      </Card>
      <LegalBox legal={d.legal} />
    </>
  );
}

/* --------------------------------------------------- Économie citoyenne */

type CitizenData = CitizenAdvice & { legal: LegalRefs; catalog: { profiles: { id: string; label: string }[]; news: { id: string; title: string }[] } };

export function Citizen({ notify }: Pick<Props, "notify">) {
  const [profil, setProfil] = useState("agriculteur");
  const [news, setNews] = useState("actu-inflation");
  const [d, setD] = useState<CitizenData | null>(null);
  useEffect(() => {
    api<CitizenData>(`/api/etat/citoyen?profil=${profil}${news ? `&actualites=${news}` : ""}`).then(setD).catch((e: Error) => notify(e.message, "error"));
  }, [profil, news, notify]);
  if (!d) return <Card><p>Chargement…</p></Card>;
  return (
    <>
      <div className="ws-toolbar">
        <select value={profil} onChange={(e) => setProfil(e.target.value)}>{d.catalog.profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <select value={news} onChange={(e) => setNews(e.target.value)}>
          <option value="">Toute l&apos;actualité (exemples)</option>
          {d.catalog.news.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
        </select>
      </div>
      <div className="etat-cols">
        <Card title="Actualité économique (exemples fictifs)" actions={<ExampleBadge />}>
          {d.news.map((n) => (
            <div key={n.id} className="etat-news">
              <strong>{n.title}</strong>
              <p className="ws-small">{n.summary}</p>
              {n.explain.map((e) => <p key={e} className="ws-small ws-muted">💬 {e}</p>)}
            </div>
          ))}
        </Card>
        <div className="ws-stack">
          <Card title={`Conseils pratiques — ${d.profile.label}`}>
            <p className="ws-small ws-muted">{d.profile.description}</p>
            <ul className="ws-recos">{d.conseils.map((c) => <li key={c}>{c}</li>)}</ul>
          </Card>
          <Card title="Programmes d'aide (exemples, non officiels)" actions={<ExampleBadge />}>
            {d.aides.length ? d.aides.map((a) => (
              <div key={a.id} className="etat-news">
                <strong>{a.name}</strong>
                <p className="ws-small">{a.benefit}</p>
                <p className="ws-small ws-muted">Éligibilité : {a.eligibility} · Démarche : {a.howTo}</p>
              </div>
            )) : <Empty>Aucun programme d&apos;exemple pour ce profil.</Empty>}
          </Card>
          <LegalBox legal={d.legal} />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------- Simulateur */

type Catalog = { measures: typeof MeasuresConst; categories: { id: string; label: string }[]; profiles: { id: string; label: string }[]; assumptions: typeof AssumptionInfoConst; defaults: Assumptions };
type SimResult = PolicySimulation & { legal: LegalRefs; documentId: string | null };

export function Simulator({ snap, notify, goTo }: Props) {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [kind, setKind] = useState("tva");
  const [value, setValue] = useState(2);
  const [target, setTarget] = useState("biens_importes");
  const [hyp, setHyp] = useState<Partial<Assumptions>>({});
  const [res, setRes] = useState<SimResult | null>(null);
  useEffect(() => {
    api<Catalog>("/api/etat/simulateur").then(setCat).catch((e: Error) => notify(e.message, "error"));
  }, [notify]);
  const run = useCallback(async (save = false) => {
    try {
      const r = await api<SimResult>("/api/etat/simulateur", "POST", { kind, value, target, assumptions: hyp, enregistrer: save, companyId: snap.company.id });
      setRes(r);
      if (save) {
        notify("Simulation enregistrée dans Documents");
        goTo("documents");
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "Erreur", "error");
    }
  }, [kind, value, target, hyp, snap.company.id, notify, goTo]);
  useEffect(() => {
    if (cat) void run();
  }, [cat, run]);
  if (!cat) return <Card><p>Chargement…</p></Card>;
  const m = cat.measures.find((x) => x.id === kind)!;
  function changeKind(k: string) {
    const def = cat!.measures.find((x) => x.id === k)!;
    setKind(k);
    setValue(def.defaultValue);
    setTarget(def.defaultTarget ?? "");
  }
  const maxAbs = (xs: number[]) => Math.max(0.01, ...xs.map(Math.abs));
  return (
    <>
      <Card title="Mesure à simuler">
        <div className="ws-toolbar">
          <select value={kind} onChange={(e) => changeKind(e.target.value)}>{cat.measures.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          <label className="etat-toggle">{m.valueLabel} <input type="number" value={value} min={m.min} max={m.max} step={kind === "transfert" ? 1000 : 1} onChange={(e) => setValue(Number(e.target.value))} style={{ width: 110 }} /></label>
          {m.target === "categorie" && (
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="toutes">Toutes les catégories</option>
              {cat.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          )}
          {m.target === "profils" && cat.profiles.map((p) => (
            <label key={p.id} className="etat-toggle"><input type="checkbox" checked={target.split(",").includes(p.id)} onChange={(e) => setTarget((e.target.checked ? [...target.split(","), p.id] : target.split(",").filter((x) => x !== p.id)).filter(Boolean).join(","))} /> {p.label}</label>
          ))}
          <button className="ws-btn" onClick={() => void run(true)}>Enregistrer dans Documents</button>
        </div>
        <p className="ws-small ws-muted">{m.help}</p>
      </Card>
      {res && (
        <>
          <div className="ws-grid">
            <Card title="Synthèse nationale (démo)">
              <div className="ws-row">Coût de la vie : <strong>{sign(res.national.costOfLiving)} %</strong></div>
              <div className="ws-row">Effet net moyen (pondéré population) : <strong>{sign(res.national.net)} %</strong></div>
              <div className="ws-row">Emploi (pondéré PIB) : <strong>{sign(res.national.employment)} %</strong></div>
              <div className="ws-row">Budget : <strong>{fmt(res.budget.annualMdFcfa)} Md FCFA/an</strong> ({res.budget.sens})</div>
            </Card>
            <Card title="Prix par catégorie">
              {res.prices.map((p) => <div key={p.id} className="etat-line"><span>{p.label}</span><Bar value={p.change} max={maxAbs(res.prices.map((x) => x.change))} negative={p.change > 0} /><b>{sign(p.change)} %</b></div>)}
            </Card>
            <Card title="Effets non intentionnels">
              {res.warnings.length ? <ul className="ws-recos">{res.warnings.map((w) => <li key={w}><AlertTriangle size={13} /> {w}</li>)}</ul> : <Empty>Aucun signal marquant avec ces hypothèses.</Empty>}
            </Card>
          </div>
          <div className="etat-cols">
            <Card title="Par profil (pouvoir d'achat)">
              <table className="ws-table"><thead><tr><th>Profil</th><th>Coût de la vie</th><th>Revenu</th><th>Pouvoir d&apos;achat</th><th>FCFA/mois*</th></tr></thead>
                <tbody>{res.profiles.map((p) => <tr key={p.id}><td>{p.label}</td><td>{sign(p.costOfLiving)} %</td><td>{sign(p.income)} %</td><td><Bar value={p.purchasingPower} max={maxAbs(res.profiles.map((x) => x.purchasingPower))} /> {sign(p.purchasingPower)} %</td><td>{fmt(p.monthlyFcfa)}</td></tr>)}</tbody>
              </table>
              <p className="ws-small ws-muted">* sur le revenu mensuel d&apos;un profil type fictif.</p>
            </Card>
            <Card title="Par région (effet net)">
              <table className="ws-table"><thead><tr><th>Région</th><th>Coût de la vie</th><th>Revenu</th><th>Net</th></tr></thead>
                <tbody>{res.regions.map((r) => <tr key={r.id}><td>{r.name}</td><td>{sign(r.costOfLiving)} %</td><td>{sign(r.income)} %</td><td><Bar value={r.net} max={maxAbs(res.regions.map((x) => x.net))} /> {sign(r.net)} %</td></tr>)}</tbody>
              </table>
            </Card>
          </div>
          <Card title="Par secteur">
            <table className="ws-table"><thead><tr><th>Secteur</th><th>Choc de coûts</th><th>Activité</th><th>Emploi</th><th>Part informelle (fictive)</th></tr></thead>
              <tbody>{res.sectors.map((s) => <tr key={s.id}><td>{s.name}</td><td>{sign(s.costShock)} %</td><td>{sign(s.outputChange)} %</td><td>{sign(s.employmentChange)} %</td><td>{Math.round(s.informalShare * 100)} %</td></tr>)}</tbody>
            </table>
          </Card>
          <Card title="Hypothèses (valeurs d'exemple, modifiables)" actions={<button className="ws-link" onClick={() => setHyp({})}>Réinitialiser</button>}>
            <div className="etat-hyp">
              {res.assumptions.map((h) => (
                <label key={h.id}>
                  <span><strong>{h.label}</strong> : {h.value}{h.value !== h.default ? ` (défaut ${h.default})` : ""}</span>
                  <input type="range" min={h.min} max={h.max} step={0.05} value={h.value} onChange={(e) => setHyp({ ...hyp, [h.id]: Number(e.target.value) })} />
                  <small className="ws-muted">{h.description}</small>
                </label>
              ))}
            </div>
            <h4>Formules</h4>
            <ul className="ws-recos">{res.formulas.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
            <h4>Limites</h4>
            <ul className="ws-recos">{res.limits.map((l) => <li key={l}>{l}</li>)}</ul>
          </Card>
          <LegalBox legal={res.legal} />
        </>
      )}
    </>
  );
}
