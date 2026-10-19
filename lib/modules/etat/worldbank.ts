/**
 * Couche RÉELLE optionnelle : API Indicateurs de la Banque mondiale (v2), publique et sans clé.
 * Documentation vérifiée le 2026-10-19 : https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures
 * Exemple d'appel : https://api.worldbank.org/v2/country/CMR/indicator/FP.CPI.TOTL.ZG?format=json&mrnev=5
 *
 * Chaque valeur renvoyée porte sa source (URL), la date de mise à jour annoncée par l'API (`lastupdated`)
 * et la date de récupération. En cas d'échec (réseau, API indisponible, désactivation), on renvoie un statut
 * « indisponible » et l'écran reste sur les données de démonstration, clairement marquées.
 *
 * Variables d'environnement :
 *  - ETAT_REAL_DATA = "worldbank" (défaut) | "off"
 *  - ETAT_WB_COUNTRY = code ISO3 du pays (défaut CMR)
 */

export type WbIndicator = { code: string; label: string; unit: string; note?: string };

/** Indicateurs vérifiés (réponse JSON valide pour CMR au 2026-10-19). */
export const WB_INDICATORS: WbIndicator[] = [
  { code: "FP.CPI.TOTL.ZG", label: "Inflation, prix à la consommation", unit: "% annuel" },
  { code: "PA.NUS.FCRF", label: "Taux de change officiel", unit: "monnaie locale par USD, moyenne de période" },
  { code: "NE.RSB.GNFS.ZS", label: "Solde extérieur des biens et services", unit: "% du PIB" },
  { code: "SL.EMP.VULN.ZS", label: "Emploi vulnérable", unit: "% de l'emploi total", note: "Estimation modélisée de l'OIT ; indicateur approché de l'informalité, pas une mesure de l'emploi informel." },
];

export const WB_DOC_URL = "https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures";
export const WB_VERIFIED_ON = "2026-10-19";

export type WbPoint = { year: string; value: number };
export type WbSeries = WbIndicator & { country: string; countryName: string; points: WbPoint[]; sourceUrl: string; lastUpdated: string | null };
export type WbLayer =
  | { status: "ok"; provider: "Banque mondiale — API Indicateurs v2"; country: string; fetchedAt: string; verifiedOn: string; docUrl: string; series: WbSeries[]; errors: string[] }
  | { status: "indisponible" | "desactive"; provider: "Banque mondiale — API Indicateurs v2"; country: string; reason: string; docUrl: string };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const cache = new Map<string, { at: number; layer: WbLayer }>();
const TTL = 6 * 3600_000;

export function wbCountry(input?: string) {
  const c = (input || process.env.ETAT_WB_COUNTRY || "CMR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : "CMR";
}

export const wbUrl = (country: string, code: string, n = 5) =>
  `https://api.worldbank.org/v2/country/${country}/indicator/${code}?format=json&mrnev=${n}`;
/** Requête groupée (plusieurs indicateurs d'une même source ; source=2 = World Development Indicators). */
export const wbBatchUrl = (country: string, codes: string[], n = 5) =>
  `https://api.worldbank.org/v2/country/${country}/indicator/${codes.join(";")}?source=2&format=json&mrnev=${n}&per_page=200`;

/** Analyse une réponse JSON de l'API (pur, testable). */
export function parseWbResponse(json: unknown, ind: WbIndicator, country: string): WbSeries {
  if (!Array.isArray(json) || json.length < 2 || !Array.isArray(json[1])) {
    const msg = Array.isArray(json) ? (json[0] as { message?: { value?: string }[] })?.message?.[0]?.value : undefined;
    throw new Error(msg || `Réponse inattendue pour ${ind.code}`);
  }
  const meta = json[0] as { lastupdated?: string };
  const rows = (json[1] as { date?: string; value?: number | null; country?: { value?: string }; indicator?: { id?: string } }[]).filter((r) => !r.indicator?.id || r.indicator.id === ind.code);
  const points = rows
    .filter((r) => typeof r.value === "number" && typeof r.date === "string")
    .map((r) => ({ year: r.date as string, value: Math.round((r.value as number) * 100) / 100 }))
    .sort((a, b) => a.year.localeCompare(b.year));
  return { ...ind, country, countryName: rows[0]?.country?.value ?? country, points, sourceUrl: wbUrl(country, ind.code), lastUpdated: meta?.lastupdated ?? null };
}

export async function fetchWorldBankLayer(opts: { country?: string; fetcher?: Fetcher; force?: boolean } = {}): Promise<WbLayer> {
  const country = wbCountry(opts.country);
  const base = { provider: "Banque mondiale — API Indicateurs v2" as const, country, docUrl: WB_DOC_URL };
  if ((process.env.ETAT_REAL_DATA || "worldbank").toLowerCase() === "off") return { ...base, status: "desactive", reason: "ETAT_REAL_DATA=off" };
  const hit = cache.get(country);
  if (!opts.force && !opts.fetcher && hit && Date.now() - hit.at < TTL) return hit.layer;
  const fetcher = opts.fetcher ?? fetch;
  const series: WbSeries[] = [];
  const errors: string[] = [];
  const get = async (url: string) => {
    const res = await fetcher(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  // 1. Une seule requête groupée (rapide) ; 2. repli indicateur par indicateur pour ce qui manque.
  let batch: unknown = null;
  try {
    batch = await get(wbBatchUrl(country, WB_INDICATORS.map((i) => i.code)));
  } catch {
    batch = null;
  }
  await Promise.all(
    WB_INDICATORS.map(async (ind) => {
      try {
        let s: WbSeries | null = null;
        if (batch) {
          try {
            s = parseWbResponse(batch, ind, country);
          } catch {
            s = null;
          }
        }
        if (!s?.points.length) s = parseWbResponse(await get(wbUrl(country, ind.code)), ind, country);
        if (s.points.length) series.push(s);
        else errors.push(`${ind.code} : aucune valeur`);
      } catch (e) {
        errors.push(`${ind.code} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );
  series.sort((a, b) => WB_INDICATORS.findIndex((i) => i.code === a.code) - WB_INDICATORS.findIndex((i) => i.code === b.code));
  const layer: WbLayer = series.length
    ? { ...base, status: "ok", fetchedAt: new Date().toISOString(), verifiedOn: WB_VERIFIED_ON, series, errors }
    : { ...base, status: "indisponible", reason: errors.join(" ; ") || "aucune donnée" };
  if (!opts.fetcher && layer.status === "ok" && !errors.length) cache.set(country, { at: Date.now(), layer });
  return layer;
}

export function __clearWbCache() {
  cache.clear();
}
