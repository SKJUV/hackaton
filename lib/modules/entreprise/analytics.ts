import type { Anomaly, DataRow, Dataset, DatasetDomain, Severity } from "./types";

/** Tableaux de bord automatiques et détection d'anomalies (fonctions pures, testables). */

export type Kpi = { label: string; value: number; unit?: string; delta?: number | null; hint?: string };
export type Series = { label: string; points: { period: string; value: number }[] };
export type Breakdown = { label: string; items: { name: string; value: number; share: number }[] };
export type DomainDashboard = { domain: DatasetDomain; datasets: string[]; isExample: boolean; kpis: Kpi[]; series: Series[]; breakdowns: Breakdown[] };

export const month = (d?: string) => (d ? d.slice(0, 7) : undefined);

export function sumBy<T>(list: T[], key: (x: T) => string | undefined, val: (x: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of list) {
    const k = key(x);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + val(x));
  }
  return m;
}

const sortedSeries = (m: Map<string, number>) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, value]) => ({ period, value: Math.round(value) }));

function breakdown(label: string, m: Map<string, number>, top = 6): Breakdown {
  const total = [...m.values()].reduce((s, v) => s + Math.abs(v), 0) || 1;
  return { label, items: [...m.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, top).map(([name, value]) => ({ name, value: Math.round(value), share: Math.round((Math.abs(value) / total) * 1000) / 10 })) };
}

function lastDelta(points: { value: number }[]): number | null {
  if (points.length < 2) return null;
  const a = points[points.length - 2].value;
  const b = points[points.length - 1].value;
  return a ? Math.round(((b - a) / Math.abs(a)) * 1000) / 10 : null;
}

/** Mois complets uniquement : on écarte le mois en cours, incomplet, pour éviter les fausses chutes. */
export function completeMonths(points: { period: string; value: number }[], now = new Date()) {
  const current = now.toISOString().slice(0, 7);
  return points.filter((p) => p.period < current);
}

export function buildDashboards(datasets: Dataset[], now = new Date()): DomainDashboard[] {
  const by = (d: DatasetDomain) => datasets.filter((x) => x.domain === d);
  const out: DomainDashboard[] = [];
  const meta = (list: Dataset[]) => ({ datasets: list.map((d) => d.name), isExample: list.some((d) => d.isExample) });

  const ventes = by("ventes");
  if (ventes.length) {
    const rows = ventes.flatMap((d) => d.rows).filter((r) => r.montant !== undefined);
    const monthly = completeMonths(sortedSeries(sumBy(rows, (r) => month(r.date), (r) => r.montant!)), now);
    const total = rows.reduce((s, r) => s + r.montant!, 0);
    const clients = sumBy(rows, (r) => r.client, (r) => r.montant!);
    out.push({
      domain: "ventes",
      ...meta(ventes),
      kpis: [
        { label: "Chiffre d'affaires (période importée)", value: Math.round(total), unit: "XAF" },
        { label: "CA du dernier mois complet", value: monthly.at(-1)?.value ?? 0, unit: "XAF", delta: lastDelta(monthly) },
        { label: "Transactions", value: rows.length },
        { label: "Panier moyen", value: rows.length ? Math.round(total / rows.length) : 0, unit: "XAF" },
        { label: "Clients actifs", value: clients.size },
      ],
      series: [{ label: "CA mensuel", points: monthly }],
      breakdowns: [breakdown("CA par client", clients), breakdown("CA par produit", sumBy(rows, (r) => r.produit, (r) => r.montant!))],
    });
  }

  const fin = by("finances");
  if (fin.length) {
    const rows = fin.flatMap((d) => d.rows).filter((r) => r.montant !== undefined);
    const inc = completeMonths(sortedSeries(sumBy(rows.filter((r) => r.montant! > 0), (r) => month(r.date), (r) => r.montant!)), now);
    const exp = completeMonths(sortedSeries(sumBy(rows.filter((r) => r.montant! < 0), (r) => month(r.date), (r) => -r.montant!)), now);
    const net = completeMonths(sortedSeries(sumBy(rows, (r) => month(r.date), (r) => r.montant!)), now);
    const totalIn = rows.filter((r) => r.montant! > 0).reduce((s, r) => s + r.montant!, 0);
    const totalOut = rows.filter((r) => r.montant! < 0).reduce((s, r) => s - r.montant!, 0);
    out.push({
      domain: "finances",
      ...meta(fin),
      kpis: [
        { label: "Revenus encaissés", value: Math.round(totalIn), unit: "XAF" },
        { label: "Dépenses", value: Math.round(totalOut), unit: "XAF" },
        { label: "Flux net", value: Math.round(totalIn - totalOut), unit: "XAF" },
        { label: "Dépenses du dernier mois", value: exp.at(-1)?.value ?? 0, unit: "XAF", delta: lastDelta(exp) },
      ],
      series: [
        { label: "Revenus", points: inc },
        { label: "Dépenses", points: exp },
        { label: "Flux net", points: net },
      ],
      breakdowns: [breakdown("Dépenses par catégorie", sumBy(rows.filter((r) => r.montant! < 0), (r) => r.categorie ?? "Non classé", (r) => -r.montant!))],
    });
  }

  const rh = by("rh");
  if (rh.length) {
    const rows = rh.flatMap((d) => d.rows);
    const today = now.toISOString().slice(0, 10);
    const active = rows.filter((r) => !r.date_sortie || r.date_sortie > today);
    const left12 = rows.filter((r) => r.date_sortie && r.date_sortie <= today && r.date_sortie >= new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10));
    const payroll = active.reduce((s, r) => s + (r.salaire ?? 0), 0);
    out.push({
      domain: "rh",
      ...meta(rh),
      kpis: [
        { label: "Effectif actif", value: active.length },
        { label: "Masse salariale mensuelle", value: Math.round(payroll), unit: "XAF" },
        { label: "Salaire moyen", value: active.length ? Math.round(payroll / active.length) : 0, unit: "XAF" },
        { label: "Départs sur 12 mois", value: left12.length, hint: rows.length ? `Taux de rotation ≈ ${Math.round((left12.length / rows.length) * 100)} %` : undefined },
      ],
      series: [],
      breakdowns: [breakdown("Effectif par département", sumBy(active, (r) => r.departement ?? "Non renseigné", () => 1)), breakdown("Masse salariale par département", sumBy(active, (r) => r.departement ?? "Non renseigné", (r) => r.salaire ?? 0))],
    });
  }

  const cl = by("clients");
  if (cl.length) {
    const rows = cl.flatMap((d) => d.rows);
    const encours = rows.reduce((s, r) => s + (r.encours ?? 0), 0);
    const late = rows.filter((r) => (r.jours_retard ?? 0) > 30);
    const weighted = encours ? rows.reduce((s, r) => s + (r.encours ?? 0) * (r.jours_retard ?? 0), 0) / encours : 0;
    const byClient = sumBy(rows, (r) => r.client, (r) => r.encours ?? 0);
    const top3 = [...byClient.values()].sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);
    out.push({
      domain: "clients",
      ...meta(cl),
      kpis: [
        { label: "Clients", value: byClient.size },
        { label: "Encours clients", value: Math.round(encours), unit: "XAF" },
        { label: "Retard moyen pondéré", value: Math.round(weighted), unit: "jours" },
        { label: "Clients en retard > 30 j", value: late.length },
        { label: "Concentration top 3", value: encours ? Math.round((top3 / encours) * 100) : 0, unit: "%" },
      ],
      series: [],
      breakdowns: [breakdown("Encours par client", byClient), breakdown("Encours par segment", sumBy(rows, (r) => r.segment ?? "Non renseigné", (r) => r.encours ?? 0))],
    });
  }
  return out;
}

/* --------------------------------------------------------------- Anomalies */

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(v: number[], q: number) {
  const s = [...v].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
}
const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

/** Pics et chutes sur une série (écart robuste à la médiane, MAD). */
export function seriesAnomalies(points: { period: string; value: number }[], threshold = 3.5): { period: string; value: number; z: number }[] {
  if (points.length < 4) return [];
  const vals = points.map((p) => p.value);
  const med = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - med))) || Math.abs(med) * 0.05 || 1;
  return points.map((p) => ({ ...p, z: (0.6745 * (p.value - med)) / mad })).filter((p) => Math.abs(p.z) >= threshold);
}

export function detectAnomalies(datasets: Dataset[], now = new Date()): Anomaly[] {
  const out: Anomaly[] = [];
  let n = 0;
  const push = (ds: Dataset, severity: Severity, kind: Anomaly["kind"], title: string, detail: string, period?: string) =>
    out.push({ id: `an_${ds.id}_${n++}`, datasetId: ds.id, domain: ds.domain, severity, kind, title, detail, period });
  const today = now.toISOString().slice(0, 10);

  for (const ds of datasets) {
    const rows = ds.rows;
    const amountRows = rows.filter((r) => r.montant !== undefined);
    // Doublons exacts (mêmes colonnes d'origine).
    const seen = new Map<string, number>();
    for (const r of rows) {
      const key = JSON.stringify(r.raw);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dups = [...seen.entries()].filter(([, c]) => c > 1);
    if (dups.length) push(ds, "attention", "doublon", `${dups.length} ligne(s) en double`, `Exemple : ${Object.values(JSON.parse(dups[0][0]) as Record<string, string>).join(" · ")} (×${dups[0][1]}). Vérifier une double saisie.`);
    const future = rows.filter((r) => r.date && r.date > today);
    if (future.length) push(ds, "attention", "date_future", `${future.length} opération(s) datée(s) dans le futur`, `Première : ${future[0].date}.`);

    if (ds.domain === "ventes") {
      const neg = amountRows.filter((r) => r.montant! < 0);
      if (neg.length) push(ds, "attention", "valeur_negative", `${neg.length} vente(s) à montant négatif`, `Ex. ${neg[0].date ?? "?"} · ${neg[0].client ?? "?"} : ${fmt(neg[0].montant!)} XAF (avoir, annulation ou erreur de saisie ?).`);
    }
    if (ds.domain === "ventes" || ds.domain === "finances") {
      const missing = rows.filter((r) => r.montant === undefined || !r.date).length;
      if (missing) push(ds, missing > rows.length * 0.1 ? "attention" : "info", "donnee_manquante", `${missing} ligne(s) sans date ou sans montant`, "Ces lignes sont exclues des totaux.");
      // Valeurs aberrantes individuelles (règle de Tukey élargie).
      const abs = amountRows.map((r) => Math.abs(r.montant!));
      if (abs.length >= 12) {
        const q1 = quantile(abs, 0.25);
        const q3 = quantile(abs, 0.75);
        const limit = q3 + 6 * (q3 - q1 || q3 * 0.5);
        const outliers = amountRows.filter((r) => Math.abs(r.montant!) > limit).sort((a, b) => Math.abs(b.montant!) - Math.abs(a.montant!));
        for (const r of outliers.slice(0, 3))
          push(ds, "attention", "valeur_aberrante", `Montant inhabituel : ${fmt(r.montant!)} XAF`, `${r.date ?? "?"}${r.client ? ` · ${r.client}` : ""}${r.categorie ? ` · ${r.categorie}` : ""} — plus de ${Math.round(Math.abs(r.montant!) / median(abs))}× la médiane.`, month(r.date));
      }
      // Pics / chutes mensuels, globalement et par catégorie de dépense.
      const monthly = completeMonths(sortedSeries(sumBy(amountRows, (r) => month(r.date), (r) => (ds.domain === "finances" ? -Math.min(0, r.montant!) : r.montant!))), now);
      for (const a of seriesAnomalies(monthly))
        push(ds, Math.abs(a.z) > 6 ? "critique" : "attention", a.z > 0 ? "pic" : "chute", `${ds.domain === "finances" ? "Dépenses" : "Ventes"} ${a.z > 0 ? "anormalement élevées" : "anormalement basses"} en ${a.period}`, `${fmt(a.value)} XAF (écart robuste ${a.z.toFixed(1)}).`, a.period);
      if (ds.domain === "finances") {
        const cats = new Set(amountRows.filter((r) => r.montant! < 0).map((r) => r.categorie ?? "Non classé"));
        for (const cat of cats) {
          const s = completeMonths(sortedSeries(sumBy(amountRows.filter((r) => r.montant! < 0 && (r.categorie ?? "Non classé") === cat), (r) => month(r.date), (r) => -r.montant!)), now);
          for (const a of seriesAnomalies(s, 4)) if (a.z > 0) push(ds, "attention", "pic", `Pic de dépenses « ${cat} » en ${a.period}`, `${fmt(a.value)} XAF contre ${fmt(median(s.map((p) => p.value)))} XAF habituellement.`, a.period);
        }
      }
      if (monthly.length >= 2) {
        const [a, b] = monthly.slice(-2);
        if (a.value && ds.domain === "ventes" && (b.value - a.value) / a.value < -0.3) push(ds, "critique", "chute", `Chute du CA de ${Math.round(((a.value - b.value) / a.value) * 100)} % en ${b.period}`, `${fmt(b.value)} XAF contre ${fmt(a.value)} XAF le mois précédent.`, b.period);
      }
    }
    if (ds.domain === "rh") {
      const sal = rows.map((r) => r.salaire).filter((x): x is number => x !== undefined);
      const byPost = new Map<string, number[]>();
      for (const r of rows) if (r.salaire !== undefined) byPost.set(r.poste ?? r.departement ?? "", [...(byPost.get(r.poste ?? r.departement ?? "") ?? []), r.salaire]);
      for (const r of rows) {
        const peers = byPost.get(r.poste ?? r.departement ?? "") ?? [];
        if (r.salaire !== undefined && peers.length >= 3 && r.salaire > median(peers) * 2.5)
          push(ds, "attention", "valeur_aberrante", `Salaire atypique pour le poste « ${r.poste ?? r.departement} »`, `${r.employe ?? "?"} : ${fmt(r.salaire)} XAF contre ${fmt(median(peers))} XAF en médiane (erreur de saisie ?).`);
      }
      const names = sumBy(rows, (r) => r.employe, () => 1);
      const dupNames = [...names.entries()].filter(([, c]) => c > 1);
      if (dupNames.length) push(ds, "attention", "doublon", `${dupNames.length} salarié(s) présent(s) plusieurs fois`, dupNames.map(([k]) => k).join(", "));
      if (!sal.length) push(ds, "info", "donnee_manquante", "Aucun salaire lisible", "La masse salariale ne peut pas être calculée.");
    }
    if (ds.domain === "clients") {
      const total = rows.reduce((s, r) => s + (r.encours ?? 0), 0);
      for (const r of rows.filter((x) => (x.jours_retard ?? 0) >= 60).sort((a, b) => (b.jours_retard ?? 0) - (a.jours_retard ?? 0)))
        push(ds, (r.jours_retard ?? 0) >= 90 ? "critique" : "attention", "retard_paiement", `${r.client} : ${r.jours_retard} jours de retard`, `Encours ${fmt(r.encours ?? 0)} XAF — relance ou mise en demeure à envisager.`);
      const top = [...rows].sort((a, b) => (b.encours ?? 0) - (a.encours ?? 0))[0];
      if (top && total && (top.encours ?? 0) / total > 0.35) push(ds, "attention", "concentration", `${top.client} concentre ${Math.round(((top.encours ?? 0) / total) * 100)} % de l'encours`, "Dépendance à un client : risque de crédit élevé en cas de défaut.");
    }
  }
  const rank: Record<Severity, number> = { critique: 0, attention: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export const domainLabel: Record<DatasetDomain, string> = { ventes: "Ventes", finances: "Finances", rh: "Ressources humaines", clients: "Clients" };
export type { DataRow };
