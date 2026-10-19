/**
 * Connexions RÉELLES à des sources publiques officielles (sans clé) :
 *  - Banque mondiale — avis de passation de marchés des projets financés au Cameroun
 *    (API publique https://search.worldbank.org/api/v2/procnotices, filtre project_ctry_code) ;
 *  - Banque mondiale — indicateurs macroéconomiques (API https://api.worldbank.org/v2).
 * Désactivable avec ENTREPRISE_LIVE_SOURCES=off ; en cas d'échec (réseau, quota), bascule automatique sur le seed « exemple ».
 * Aucune donnée n'est envoyée à ces services : requêtes GET publiques uniquement.
 */

export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type LiveTender = { id: string; title: string; buyer: string; country: string; noticeType: string; method: string; publishedAt: string; deadline: string | null; url: string; source: "Banque mondiale" };
export type LiveIndicator = { id: string; label: string; year: string; value: number; source: string; url: string };
export type SourceStatus = { name: string; url: string; live: boolean; error?: string; fetchedAt?: string };

export function liveSourcesEnabled(): boolean {
  return (process.env.ENTREPRISE_LIVE_SOURCES ?? "auto").toLowerCase() !== "off";
}

const cache = new Map<string, { at: number; value: unknown }>();
const TTL = 60 * 60 * 1000;

async function getJson(url: string, fetchImpl: FetchLike, timeoutMs = Number(process.env.ENTREPRISE_SOURCES_TIMEOUT_MS) || 12000): Promise<unknown> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { Accept: "application/json", "User-Agent": "Co-founder/1.0 (veille appels d'offres)" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const value = await res.json();
    cache.set(url, { at: Date.now(), value });
    return value;
  } finally {
    clearTimeout(timer);
  }
}

export function __clearSourceCache() {
  cache.clear();
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export const WORLD_BANK_PROCUREMENT = "https://search.worldbank.org/api/v2/procnotices";

export async function fetchWorldBankTenders(countryCode = "CM", rows = 25, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<{ items: LiveTender[]; status: SourceStatus }> {
  const url = `${WORLD_BANK_PROCUREMENT}?format=json&project_ctry_code=${encodeURIComponent(countryCode)}&rows=${rows}&srt=submission_date&order=desc&fl=id,notice_type,noticedate,submission_deadline_date,project_ctry_name,project_name,bid_description,procurement_method_name,contact_organization`;
  const status: SourceStatus = { name: "Banque mondiale — avis de passation de marchés", url: "https://projects.worldbank.org/en/projects-operations/procurement", live: false };
  if (!liveSourcesEnabled()) return { items: [], status: { ...status, error: "Désactivé (ENTREPRISE_LIVE_SOURCES=off)" } };
  try {
    const data = (await getJson(url, fetchImpl)) as { procnotices?: Record<string, string>[] };
    const items = (data.procnotices ?? []).map((n) => ({
      id: n.id,
      title: stripHtml(n.bid_description || n.project_name || "Avis sans intitulé"),
      buyer: n.contact_organization || n.project_name || "—",
      country: n.project_ctry_name || countryCode,
      noticeType: n.notice_type || "",
      method: n.procurement_method_name || "",
      publishedAt: n.noticedate || "",
      deadline: n.submission_deadline_date ? n.submission_deadline_date.slice(0, 10) : null,
      url: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${encodeURIComponent(n.id)}`,
      source: "Banque mondiale" as const,
    }));
    return { items, status: { ...status, live: true, fetchedAt: new Date().toISOString() } };
  } catch (error) {
    return { items: [], status: { ...status, error: error instanceof Error ? error.message : "Erreur" } };
  }
}

export const INDICATORS: { id: string; label: string }[] = [
  { id: "FP.CPI.TOTL.ZG", label: "Inflation, prix à la consommation (% annuel)" },
  { id: "PA.NUS.FCRF", label: "Taux de change officiel (unités de monnaie locale pour 1 USD, moyenne annuelle)" },
  { id: "FR.INR.LEND", label: "Taux d'intérêt débiteur (%)" },
  { id: "NY.GDP.MKTP.KD.ZG", label: "Croissance du PIB (% annuel)" },
];

export async function fetchWorldBankIndicators(countryCode = "CM", fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<{ items: LiveIndicator[]; status: SourceStatus }> {
  const status: SourceStatus = { name: "Banque mondiale — indicateurs du développement", url: `https://data.worldbank.org/country/${countryCode}`, live: false };
  if (!liveSourcesEnabled()) return { items: [], status: { ...status, error: "Désactivé (ENTREPRISE_LIVE_SOURCES=off)" } };
  try {
    const items: LiveIndicator[] = [];
    await Promise.all(
      INDICATORS.map(async (ind) => {
        const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/${ind.id}?format=json&mrnev=1`;
        const data = (await getJson(url, fetchImpl)) as [unknown, { date: string; value: number | null }[] | null];
        const point = Array.isArray(data) ? data[1]?.find((p) => p.value !== null) : undefined;
        if (point && point.value !== null) items.push({ id: ind.id, label: ind.label, year: point.date, value: Math.round(point.value * 100) / 100, source: "Banque mondiale (WDI)", url: `https://data.worldbank.org/indicator/${ind.id}?locations=${countryCode}` });
      }),
    );
    items.sort((a, b) => INDICATORS.findIndex((i) => i.id === a.id) - INDICATORS.findIndex((i) => i.id === b.id));
    return { items, status: { ...status, live: items.length > 0, fetchedAt: new Date().toISOString(), error: items.length ? undefined : "Aucune valeur" } };
  } catch (error) {
    return { items: [], status: { ...status, error: error instanceof Error ? error.message : "Erreur" } };
  }
}

/** Sources officielles nationales consultables (pas d'API publique documentée vérifiée : lien direct, non branchées). */
export const NATIONAL_TENDER_PORTALS = [
  { name: "ARMP — Agence de Régulation des Marchés Publics (Cameroun)", url: "https://armp.cm/filtres?type=avis&val=1", note: "Publication officielle des avis ; pas d'API publique documentée vérifiée — consultation manuelle." },
  { name: "COLEPS — plateforme nationale de passation en ligne", url: "https://www.marchespublics.cm", note: "Dossiers d'appel d'offres et soumission en ligne ; pas d'API publique documentée vérifiée." },
];
