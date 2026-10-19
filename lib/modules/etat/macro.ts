import { DEMO_BANNER, DEMO_NOTICE, NATIONAL_SERIES, PERIODS, REGIONS, SECTORS, regionById, type SeriesDef } from "./seed";
import { fetchWorldBankLayer, type WbLayer } from "./worldbank";

/** Fenêtre glissante (en périodes) pour mesurer les variations. */
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export type Kpi = {
  id: string;
  label: string;
  unit: string;
  latest: number;
  previous: number;
  change: number;
  change3: number;
  trend: "hausse" | "baisse" | "stable";
  tone: "favorable" | "defavorable" | "neutre";
  values: number[];
  description: string;
};

export function kpiOf(s: SeriesDef): Kpi {
  const v = s.values;
  const latest = v[v.length - 1];
  const previous = v[v.length - 2];
  const change = round(latest - previous, 2);
  const change3 = round(latest - v[v.length - 4], 2);
  const trend = Math.abs(change3) < 1e-9 ? "stable" : change3 > 0 ? "hausse" : "baisse";
  const tone = s.goodWhen === "neutral" || trend === "stable" ? "neutre" : (trend === "hausse") === (s.goodWhen === "up") ? "favorable" : "defavorable";
  return { id: s.id, label: s.label, unit: s.unit, latest, previous, change, change3, trend, tone, values: v, description: s.description };
}

export type MacroDashboard = {
  banner: string;
  notice: string;
  isDemo: true;
  periods: string[];
  kpis: Kpi[];
  regions: (Omit<(typeof REGIONS)[number], "market"> & { market: (typeof REGIONS)[number]["market"]; tension: number; rank: number })[];
  sectors: { id: string; name: string; gdpShare: number; informalShare: number; latest: number; change3: number; values: number[] }[];
  earlyWarnings: { indicator: string; message: string; level: "vigilance" | "alerte" }[];
  focus?: { region: string; highlights: string[] };
  realLayer: WbLayer | null;
};

/** Indice fictif de tension régionale (0–100) : inflation alimentaire, informalité, éloignement. Formule affichée dans l'UI. */
export function regionalTension(r: (typeof REGIONS)[number]) {
  return Math.round(Math.min(100, (r.foodInflation / 12) * 50 + (r.informalShare / 100) * 30 + r.remoteness * 20));
}
export const TENSION_FORMULA = "tension = 50 × inflation alimentaire / 12 + 30 × part informelle + 20 × éloignement (plafonné à 100)";

export function earlyWarnings(kpis: Kpi[]): MacroDashboard["earlyWarnings"] {
  const out: MacroDashboard["earlyWarnings"] = [];
  const k = (id: string) => kpis.find((x) => x.id === id)!;
  const food = k("inflation_alimentaire");
  if (food.latest >= 8) out.push({ indicator: food.label, level: food.latest >= 10 ? "alerte" : "vigilance", message: `Inflation alimentaire à ${food.latest} % (+${round(food.change3)} pt sur 3 périodes).` });
  const res = k("reserves_mois_import");
  if (res.latest < 4) out.push({ indicator: res.label, level: res.latest < 3 ? "alerte" : "vigilance", message: `Réserves à ${res.latest} mois d'importations, en baisse continue.` });
  const fx = k("change_xaf_usd");
  const dep = round(((fx.latest - fx.values[fx.values.length - 4]) / fx.values[fx.values.length - 4]) * 100);
  if (dep >= 2) out.push({ indicator: fx.label, level: dep >= 5 ? "alerte" : "vigilance", message: `Dépréciation de ${dep} % sur 3 périodes.` });
  const bal = k("balance_commerciale");
  if (bal.change3 < -5) out.push({ indicator: bal.label, level: "vigilance", message: `Déficit aggravé de ${Math.abs(bal.change3)} Md FCFA en 3 périodes.` });
  const stock = k("stock_cereales_semaines");
  if (stock.latest < 7) out.push({ indicator: stock.label, level: stock.latest < 5 ? "alerte" : "vigilance", message: `Stocks à ${stock.latest} semaines de consommation.` });
  return out;
}

export async function buildMacroDashboard(opts: { region?: string; includeReal?: boolean; country?: string; fetcher?: (u: string, i?: RequestInit) => Promise<Response> } = {}): Promise<MacroDashboard> {
  const kpis = NATIONAL_SERIES.map(kpiOf);
  const regions = REGIONS.map((r) => ({ ...r, tension: regionalTension(r), rank: 0 }))
    .sort((a, b) => b.tension - a.tension)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const sectors = SECTORS.map((s) => ({ id: s.id, name: s.name, gdpShare: s.gdpShare, informalShare: s.informalShare, latest: s.productionIndex[11], change3: round(s.productionIndex[11] - s.productionIndex[8]), values: s.productionIndex }));
  let focus: MacroDashboard["focus"];
  if (opts.region) {
    const r = regionById(opts.region);
    if (r) {
      const t = regions.find((x) => x.id === r.id)!;
      const nat = kpis.find((x) => x.id === "inflation_alimentaire")!.latest;
      focus = {
        region: r.name,
        highlights: [
          `Tension régionale ${t.tension}/100 (rang ${t.rank}/${regions.length}).`,
          `Inflation alimentaire ${r.foodInflation} % (${r.foodInflation >= nat ? "au-dessus" : "en dessous"} de la moyenne nationale de démo, ${nat} %).`,
          `Emploi informel ${r.informalShare} % ; agriculture ${Math.round(r.agriShare * 100)} % de l'activité.`,
          `Marché local : maïs ${r.market.mais_kg} FCFA/kg, riz ${r.market.riz_kg} FCFA/kg, huile ${r.market.huile_l} FCFA/L.`,
        ],
      };
    }
  }
  const realLayer = opts.includeReal ? await fetchWorldBankLayer({ country: opts.country, fetcher: opts.fetcher }) : null;
  return { banner: DEMO_BANNER, notice: DEMO_NOTICE, isDemo: true, periods: PERIODS, kpis, regions, sectors, earlyWarnings: earlyWarnings(kpis), focus, realLayer };
}
