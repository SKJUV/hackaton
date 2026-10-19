import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { runAgent } from "@/lib/agent/runner";
import { ALL_TOOLS, DEMO_INTENTS, TOOL_MAP } from "@/lib/agent/registry";
import type { ToolContext } from "@/lib/agent/tools";
import { getSnapshot } from "@/lib/workspace/service";
import { citizenAdvice } from "@/lib/modules/etat/citizen";
import { assessCrises, communicationPlan, communiqueMarkdown, indicatorScore, periodsToCritical } from "@/lib/modules/etat/crisis";
import { buildMacroDashboard, kpiOf } from "@/lib/modules/etat/macro";
import { DEFAULT_ASSUMPTIONS, normalizeInput, simulatePolicy, simulationMarkdown } from "@/lib/modules/etat/policy";
import { AID_PROGRAMS, DEMO_BANNER, NATIONAL_SERIES, NEWS, PROFILES } from "@/lib/modules/etat/seed";
import { detectCrisis, detectNews, detectProfile, parseMeasure } from "@/lib/modules/etat/agent";
import { __clearWbCache, fetchWorldBankLayer, parseWbResponse, WB_INDICATORS, wbUrl } from "@/lib/modules/etat/worldbank";

const wbJson = (code: string, values: [string, number | null][]) => [
  { page: 1, pages: 1, per_page: 50, total: values.length, lastupdated: "2026-10-08" },
  values.map(([date, value]) => ({ indicator: { id: code, value: code }, country: { id: "CM", value: "Cameroon" }, countryiso3code: "CMR", date, value })),
];
const okFetcher = async (url: string) => {
  const code = url.match(/indicator\/([^?]+)/)![1];
  return new Response(JSON.stringify(wbJson(code, [["2025", 3.40373], ["2024", 4.5333], ["2023", null]])), { status: 200 });
};

describe("État — données de démo", () => {
  it("le bandeau est imposé et le seed est marqué", () => {
    expect(DEMO_BANNER).toBe("Démo — données fictives");
    expect(AID_PROGRAMS.every((a) => a.isExample && a.name.startsWith("EXEMPLE"))).toBe(true);
    expect(NEWS.every((n) => n.isExample && n.title.startsWith("EXEMPLE"))).toBe(true);
    for (const s of NATIONAL_SERIES) expect(s.values).toHaveLength(12);
  });
});

describe("État — tableau de bord macro", () => {
  afterEach(() => {
    delete process.env.ETAT_REAL_DATA;
    __clearWbCache();
  });

  it("calcule les indicateurs, alertes précoces et la granularité régionale", async () => {
    const d = await buildMacroDashboard({ region: "littoral" });
    expect(d.isDemo).toBe(true);
    expect(d.banner).toBe(DEMO_BANNER);
    expect(d.kpis.map((k) => k.id)).toEqual(expect.arrayContaining(["indice_prix", "change_xaf_usd", "balance_commerciale", "emploi_informel"]));
    expect(d.regions).toHaveLength(10);
    expect(d.regions[0].tension).toBeGreaterThanOrEqual(d.regions[9].tension);
    expect(d.earlyWarnings.length).toBeGreaterThan(0);
    expect(d.focus?.region).toBe("Littoral");
    expect(d.realLayer).toBeNull();
  });

  it("lit la tendance et le sens favorable", () => {
    const k = kpiOf({ id: "indice_prix", label: "x", unit: "u", goodWhen: "down", description: "", values: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4] });
    expect(k.trend).toBe("hausse");
    expect(k.tone).toBe("defavorable");
  });

  it("couche réelle Banque mondiale : analyse, source et date (fetch simulé)", async () => {
    const d = await buildMacroDashboard({ includeReal: true, fetcher: okFetcher });
    const layer = d.realLayer!;
    expect(layer.status).toBe("ok");
    if (layer.status !== "ok") return;
    expect(layer.series).toHaveLength(WB_INDICATORS.length);
    expect(layer.series[0].points).toEqual([{ year: "2024", value: 4.53 }, { year: "2025", value: 3.4 }]);
    expect(layer.series[0].sourceUrl).toBe(wbUrl("CMR", "FP.CPI.TOTL.ZG"));
    expect(layer.series[0].lastUpdated).toBe("2026-10-08");
    expect(layer.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("une seule requête groupée suffit quand l'API répond pour tous les indicateurs", async () => {
    const calls: string[] = [];
    const batchFetcher = async (url: string) => {
      calls.push(url);
      const rows = WB_INDICATORS.flatMap((i) => (wbJson(i.code, [["2025", 1.234]])[1] as object[]));
      return new Response(JSON.stringify([{ lastupdated: "2026-10-08" }, rows]), { status: 200 });
    };
    const layer = await fetchWorldBankLayer({ fetcher: batchFetcher });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("source=2");
    expect(layer.status === "ok" && layer.series.every((x) => x.points[0].value === 1.23)).toBe(true);
  });

  it("bascule sur la démo si l'API échoue ou est désactivée", async () => {
    const down = await fetchWorldBankLayer({ fetcher: async () => new Response("err", { status: 503 }) });
    expect(down.status).toBe("indisponible");
    expect(() => parseWbResponse([{ message: [{ value: "The indicator was not found." }] }], WB_INDICATORS[0], "CMR")).toThrow(/not found/);
    process.env.ETAT_REAL_DATA = "off";
    expect((await fetchWorldBankLayer({ fetcher: okFetcher })).status).toBe("desactive");
  });
});

describe("État — module crise", () => {
  it("score linéaire : 50 au seuil de vigilance, 100 au seuil critique, dans les deux sens", () => {
    expect(indicatorScore({ vigilance: 8, critical: 12 }, 8)).toBe(50);
    expect(indicatorScore({ vigilance: 8, critical: 12 }, 14)).toBe(100);
    expect(indicatorScore({ vigilance: 4, critical: 3 }, 3.5)).toBe(75);
    expect(indicatorScore({ vigilance: 4, critical: 3 }, 6)).toBe(0);
  });

  it("fenêtre d'action par extrapolation linéaire", () => {
    const base = { id: "x", label: "x", unit: "u", danger: "down" as const, vigilance: 4, critical: 3 };
    expect(periodsToCritical({ ...base, values: [6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4.5, 4] })).toBe(1.5); // pente (4 − 6) / 3
    expect(periodsToCritical({ ...base, values: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 2] })).toBe(0);
    expect(periodsToCritical({ ...base, values: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 6] })).toBeNull();
  });

  it("alertes triées avec fenêtre d'action et actions préventives", () => {
    const a = assessCrises();
    expect(a.alerts).toHaveLength(3);
    expect(a.alerts[0].score).toBeGreaterThanOrEqual(a.alerts[2].score);
    for (const al of a.alerts) {
      expect(al.preventiveActions.length).toBeGreaterThan(0);
      expect(al.actionWindow.label).toBeTruthy();
    }
    expect(a.method).toMatch(/EXEMPLE/);
  });

  it("plan de communication segmenté par profil, avec anti-panique et aides d'exemple", () => {
    const all = communicationPlan("approvisionnement");
    expect(all.segments.map((s) => s.profile)).toEqual(PROFILES.map((p) => p.id));
    const one = communicationPlan("change", ["artisan"]);
    expect(one.segments).toHaveLength(1);
    expect(one.segments[0].conseils.length).toBeGreaterThan(1);
    expect(one.antiPanic.length).toBeGreaterThan(3);
    expect(one.segments[0].aides.every((x) => x.isExample)).toBe(true);
    expect(communiqueMarkdown(one)).toContain(DEMO_BANNER);
  });
});

describe("État — économie citoyenne", () => {
  it("conseils par profil, programmes d'exemple et requête juridique", () => {
    for (const p of ["agriculteur", "famille", "artisan"]) {
      const a = citizenAdvice(p);
      expect(a.profile.id).toBe(p);
      expect(a.conseils.length).toBeGreaterThan(2);
      expect(a.aides.length).toBeGreaterThan(0);
      expect(a.aides.every((x) => x.isExample)).toBe(true);
      expect(a.legalQuery).toMatch(/consommateur/);
    }
    const fx = citizenAdvice("agriculteur", ["actu-fcfa-apprecie"]);
    expect(fx.news).toHaveLength(1);
    expect(fx.conseils.join(" ")).toMatch(/export/);
    expect(citizenAdvice("inconnu").profile.id).toBe("famille");
  });
});

describe("État — simulateur de politiques", () => {
  it("TVA : hausse des prix de la catégorie ciblée et recettes", () => {
    const s = simulatePolicy({ kind: "tva", value: 2, target: "biens_importes" });
    expect(s.prices.find((p) => p.id === "biens_importes")!.change).toBeCloseTo(2 * 0.7 * 0.7, 2);
    expect(s.prices.find((p) => p.id === "alimentation")!.change).toBe(0);
    expect(s.budget.annualMdFcfa).toBeGreaterThan(0);
    expect(s.profiles.every((p) => p.purchasingPower <= 0)).toBe(true);
  });

  it("subvention : baisse des prix, coût budgétaire, fuite signalée", () => {
    const s = simulatePolicy({ kind: "subvention", value: 10, target: "alimentation" });
    expect(s.prices[0].change).toBe(-6);
    expect(s.budget.annualMdFcfa).toBeLessThan(0);
    expect(s.warnings.join(" ")).toMatch(/n'atteint pas/);
  });

  it("carburant : les régions éloignées sont plus touchées ; transfert : profils ciblés", () => {
    const c = simulatePolicy({ kind: "carburant", value: 20 });
    expect(c.regions[0].name).toMatch(/Extrême-Nord|Est/);
    expect(c.profiles.find((p) => p.id === "transporteur")!.purchasingPower).toBeLessThan(c.profiles.find((p) => p.id === "famille")!.purchasingPower);
    const t = simulatePolicy({ kind: "transfert", value: 10000, target: "agriculteur" });
    expect(t.profiles.find((p) => p.id === "agriculteur")!.purchasingPower).toBeGreaterThan(5);
    expect(t.profiles.find((p) => p.id === "artisan")!.purchasingPower).toBeCloseTo(0, 1);
  });

  it("hypothèses affichées, modifiables et bornées", () => {
    const n = normalizeInput({ kind: "tva", value: 999, assumptions: { repercussionTaxe: 5, inconnu: 1 } as never });
    expect(n.value).toBe(20);
    expect(n.assumptions!.repercussionTaxe).toBe(1);
    const s = simulatePolicy({ kind: "tva", value: 2, assumptions: { repercussionTaxe: 0.35 } });
    const h = s.assumptions.find((x) => x.id === "repercussionTaxe")!;
    expect(h.value).toBe(0.35);
    expect(h.default).toBe(DEFAULT_ASSUMPTIONS.repercussionTaxe);
    expect(s.formulas.length).toBeGreaterThan(5);
    expect(simulationMarkdown(s)).toContain("Hypothèses");
  });
});

describe("État — outils de l'agent", () => {
  beforeEach(useTempDb);

  it("les 6 outils sont enregistrés, avec schéma objet", () => {
    const names = ["etat_tableau_macro", "etat_alertes_crise", "etat_plan_communication_crise", "etat_preparer_communique", "etat_conseils_citoyens", "etat_simuler_politique"];
    for (const n of names) expect(TOOL_MAP.get(n)?.parameters.type).toBe("object");
    expect(TOOL_MAP.get("etat_preparer_communique")!.external).toBe(true);
    expect(new Set(ALL_TOOLS.map((t) => t.name)).size).toBe(ALL_TOOLS.length);
    expect(ALL_TOOLS[0].name).toBe("rechercher_textes_juridiques");
  });

  it("simulation enregistrée dans Documents avec fondement juridique", async () => {
    const ctx: ToolContext = { companyId: "co_kmerlog", citations: [], groundings: [] };
    const r = await TOOL_MAP.get("etat_simuler_politique")!.run({ mesure: "tva", valeur: 2, enregistrer: true }, ctx);
    const data = r.data as { documentId: string; fondement_juridique: { statut: string }; bandeau: string };
    expect(data.bandeau).toBe(DEMO_BANNER);
    expect(data.fondement_juridique.statut).toMatch(/fonde|partiel|non_couvert/);
    const snap = await getSnapshot("co_kmerlog");
    const doc = snap.documents.find((d) => d.id === data.documentId)!;
    expect(doc.needsReview).toBe(true);
    expect(doc.content).toContain("Fondement juridique");
  });

  it("communiqué : document à valider + email dans la file d'approbation, jamais envoyé", async () => {
    const ctx: ToolContext = { companyId: "co_kmerlog", citations: [], groundings: [] };
    const r = await TOOL_MAP.get("etat_preparer_communique")!.run({ type_crise: "change", profil: "famille", destinataires: ["cellule@exemple.com"] }, ctx);
    const { approbation } = r.data as { approbation: string };
    const snap = await getSnapshot("co_kmerlog");
    const appr = snap.approvals.find((a) => a.id === approbation)!;
    expect(appr.status).toBe("en_attente");
    expect(appr.module).toBe("etat");
    expect(snap.emails.some((e) => e.status === "envoye" || e.status === "simule")).toBe(false);
  });

  it("intentions démo (registre) : État détecté sans détourner les autres demandes", () => {
    const norm = (m: string) => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const etatIntents = (m: string) => DEMO_INTENTS.filter((i) => i.name.startsWith("etat_") && i.test.test(norm(m))).map((i) => i.name);
    expect(etatIntents("Simule une hausse de TVA de 2 points sur les produits importés")).toContain("etat_simulateur");
    expect(etatIntents("Quels sont les risques de crise et comment éviter la panique ?")).toContain("etat_crise");
    expect(etatIntents("Conseils pratiques pour un agriculteur face à l'inflation")).toContain("etat_citoyen");
    expect(etatIntents("Montre le tableau de bord macro, inflation et taux de change")).toContain("etat_macro");
    expect(etatIntents("Demande des devis pour 10 motos")).toEqual([]);
    expect(etatIntents("Génère nos statuts et un contrat de prestation")).toEqual([]);
    expect(etatIntents("Simule une réponse du fournisseur")).toEqual([]);
    expect(parseMeasure("baisse de la TVA de 5 points sur l'alimentation")).toEqual({ mesure: "tva", valeur: -5, cible: "alimentation" });
    expect(parseMeasure("transfert de 20 000 FCFA aux familles")).toMatchObject({ mesure: "transfert", valeur: 20000, cible: "famille" });
    expect(detectProfile("je suis artisan")).toBe("artisan");
    expect(detectCrisis("pénurie de riz")).toBe("approvisionnement");
    expect(detectNews("Conseils pour un artisan face à l'inflation")).toEqual(["actu-inflation"]);
    expect(detectNews("que faire ?")).toEqual(["actu-inflation", "actu-programme"]);
  });

  it("mode démo sans clé : l'agent appelle le simulateur après la recherche juridique", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Simule une hausse de TVA de 2 points sur les produits importés" }]);
    expect(reply.mode).toBe("demo");
    expect(reply.toolTrace[0].tool).toBe("rechercher_textes_juridiques");
    expect(reply.toolTrace.map((t) => t.tool)).toContain("etat_simuler_politique");
    expect(reply.answer).toContain(DEMO_BANNER);
  });
});
