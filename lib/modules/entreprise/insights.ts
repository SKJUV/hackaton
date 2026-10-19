import { regulatoryWatch } from "@/lib/compliance";
import { listOfficialDocuments } from "@/lib/legal/corpus";
import { getSnapshot } from "@/lib/workspace/service";
import { detectAnomalies } from "./analytics";
import { computeFinance, STRESS_SCENARIOS, stressTest, type StressParams } from "./finance";
import { citePoint } from "./legal";
import { computeRiskProfile } from "./risk";
import { MARKET_SIGNALS_EXAMPLE, TENDERS_EXAMPLE } from "./seed";
import { getState } from "./service";
import { fetchWorldBankIndicators, fetchWorldBankTenders, NATIONAL_TENDER_PORTALS, type FetchLike } from "./sources";
import { norm } from "./structure";

/** Veille sectorielle filtrée par profil, appels d'offres, profil de risque et simulation de stress. */

const stem = (w: string) => norm(w).slice(0, 6);
const STOP = new Set(["des", "les", "pour", "avec", "dans", "une", "sur", "par", "aux", "acces", "fourniture", "services", "service"]);

export function profileKeywords(company: { sector: string; sectorKeywords: string[] }, extra: string[] = []): string[] {
  const words = [...company.sectorKeywords, ...extra, ...company.sector.split(/[\s,;'’()-]+/)].map((w) => w.trim()).filter((w) => norm(w).length >= 4 && !STOP.has(norm(w)));
  return [...new Set(words.map((w) => w.toLowerCase()))];
}

export function matchKeywords(text: string, keywords: string[]): string[] {
  const words = new Set(norm(text).split(" ").map((w) => w.slice(0, 6)));
  const hay = norm(text);
  return keywords.filter((k) => {
    const n = norm(k);
    return n.includes(" ") ? hay.includes(n) : words.has(stem(n));
  });
}

export async function sectorWatch(companyId: string, opts: { keywords?: string[]; fetchImpl?: FetchLike } = {}) {
  const st = await getState(companyId);
  const keywords = profileKeywords(st.company, opts.keywords);
  const docs = await listOfficialDocuments();
  const all = regulatoryWatch(keywords, docs, 24);
  const regulatory = all.filter((a) => !a.source.startsWith("publications/")).slice(0, 8);
  const publications = all.filter((a) => a.source.startsWith("publications/") && !/appel d.offre/i.test(a.source)).slice(0, 6);
  const signals = MARKET_SIGNALS_EXAMPLE.map((s) => ({ ...s, matched: matchKeywords(s.tags.join(" "), keywords), isExample: true }))
    .filter((s) => s.matched.length)
    .map((s) => ({ ...s, action: s.kind === "concurrence" ? "Mettre à jour l'analyse concurrentielle et l'argumentaire prix." : s.kind === "matieres_premieres" ? "Simuler l'impact sur les coûts (onglet stress) et renégocier les contrats." : s.kind === "disruption" ? "Évaluer l'opportunité/menace en comité de direction." : "Adapter l'offre et la communication." }));
  const macro = await fetchWorldBankIndicators(st.company.country === "Cameroun" ? "CM" : "CM", opts.fetchImpl);
  return {
    profile: { sector: st.company.sector, keywords },
    regulatory: regulatory.map((a) => ({ ...a, action: a.isNewOfficial ? "Nouveau texte officiel : lire et mettre à jour la checklist de conformité." : "Vérifier l'impact sur l'activité (demander à l'agent)." })),
    publications,
    signals,
    macro,
    notes: [
      "La veille réglementaire réutilise le corpus officiel (textes déposés par l'État) ; les nouveaux textes de corpus/officiel apparaissent en premier.",
      "Les signaux de marché affichés sont des EXEMPLES tant qu'aucun flux sectoriel n'est branché.",
      macro.status.live ? "Indicateurs macroéconomiques : données réelles de la Banque mondiale (dernière valeur disponible)." : `Indicateurs macroéconomiques indisponibles (${macro.status.error ?? "hors ligne"}).`,
    ],
  };
}

export async function tenderAlerts(companyId: string, opts: { keywords?: string[]; fetchImpl?: FetchLike; now?: Date } = {}) {
  const st = await getState(companyId);
  const now = opts.now ?? new Date();
  const keywords = profileKeywords(st.company, opts.keywords);
  const examples = TENDERS_EXAMPLE.map((t) => ({ ...t, matched: matchKeywords(`${t.title} ${t.tags.join(" ")}`, keywords), deadline: new Date(now.getTime() + t.deadlineDays * 86400000).toISOString().slice(0, 10), isExample: true }))
    .filter((t) => t.matched.length)
    .map(({ deadlineDays: _d, ...t }) => t);
  const docs = await listOfficialDocuments();
  const archive = docs
    .filter((d) => /appel d.offre/i.test(d.source))
    .map((d) => ({ title: d.title.replace(/\s*copie\s*/gi, " ").replace(/\s+/g, " ").trim(), source: d.source, matched: matchKeywords(d.sample.slice(0, 20000), keywords), excerpt: d.sample.replace(/\s+/g, " ").slice(0, 240) }))
    .filter((d, i, all) => all.findIndex((x) => x.title.replace(/^\d+\.\s*/, "") === d.title.replace(/^\d+\.\s*/, "")) === i)
    .sort((a, b) => b.matched.length - a.matched.length);
  const wb = await fetchWorldBankTenders("CM", 40, opts.fetchImpl);
  const today = now.toISOString().slice(0, 10);
  const live = wb.items
    .filter((t) => !/award|attribution/i.test(t.noticeType)) // les avis d'attribution ne sont pas des appels ouverts
    .map((t) => ({ ...t, matched: matchKeywords(`${t.title} ${t.buyer}`, keywords), open: !t.deadline || t.deadline >= today }))
    .sort((a, b) => Number(b.open) - Number(a.open) || b.matched.length - a.matched.length);
  return {
    profile: { keywords },
    live: { status: wb.status, matching: live.filter((t) => t.matched.length && t.open), others: live.filter((t) => !t.matched.length && t.open).slice(0, 8) },
    archive: { label: "Avis d'appels d'offres de l'ART présents dans le corpus (documents réels, archives — vérifier les dates)", items: archive.slice(0, 10) },
    examples,
    portals: NATIONAL_TENDER_PORTALS,
  };
}

export async function riskProfile(companyId: string, now = new Date()) {
  const st = await getState(companyId, now);
  const snap = await getSnapshot(companyId); // séquentiel : le store JSON ne supporte pas deux premiers chargements concurrents
  const finance = computeFinance(st.datasets, st.budgets, st.settings, now);
  const anomalies = detectAnomalies(st.datasets, now);
  const overdue = snap.obligations.filter((o) => !o.done && new Date(o.dueDate) < now).length;
  const regulatedLegal = await citePoint("reg_secteur", `Régime juridique du secteur « ${st.company.sector} »`, `régime juridique ${st.company.sectorKeywords.slice(0, 4).join(" ")} autorisation licence obligations`, 3, /licence|autorisation|declaration|agrement|concession/);
  return computeRiskProfile({ datasets: st.datasets, finance, anomalies, compliance: snap.compliance, overdueObligations: overdue, regulatedLegal, now });
}

export async function runStress(companyId: string, custom?: StressParams & { label?: string }, now = new Date()) {
  const st = await getState(companyId, now);
  const scenarios = custom ? [...STRESS_SCENARIOS, { id: "personnalise", label: custom.label || "Scénario personnalisé", params: custom }] : STRESS_SCENARIOS;
  const { base, results } = stressTest(st.datasets, st.budgets, st.settings, now, scenarios);
  return { base: { currentCash: base.currentCash, forecast: base.forecast, runwayMonths: base.totals.runwayMonths, hypotheses: base.hypotheses, isExample: base.isExample, currency: base.currency }, results };
}
