import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./setup-db";
import { parseCsv, toCsv } from "@/lib/modules/entreprise/csv";
import { readZip, writeZip } from "@/lib/modules/entreprise/zip";
import { readXlsx } from "@/lib/modules/entreprise/xlsx";
import { markdownToPdf } from "@/lib/modules/entreprise/pdf";
import { detectDomain, parseDate, parseNumber, structureTable } from "@/lib/modules/entreprise/structure";
import { buildDashboards, detectAnomalies, seriesAnomalies } from "@/lib/modules/entreprise/analytics";
import { computeFinance, stressTest } from "@/lib/modules/entreprise/finance";
import { seedBudgets, seedDatasets, seedSettings } from "@/lib/modules/entreprise/seed";
import { dataOverview, getState, importData, loadExampleData, deleteDataset, updateSettings } from "@/lib/modules/entreprise/service";
import { generateWeeklyReport, buildFinancialExport } from "@/lib/modules/entreprise/reports";
import { dueDiligence } from "@/lib/modules/entreprise/duediligence";
import { buildDataRoom, dataRoomZip } from "@/lib/modules/entreprise/dataroom";
import { riskProfile, tenderAlerts, matchKeywords } from "@/lib/modules/entreprise/insights";
import { fetchWorldBankTenders, fetchWorldBankIndicators, __clearSourceCache, type FetchLike } from "@/lib/modules/entreprise/sources";
import { TOOL_MAP } from "@/lib/agent/tools";
import { detectIntents, runDemoPlanner } from "@/lib/agent/demo-planner";
import { createCompany, getSnapshot } from "@/lib/workspace/service";
import { readData, resetDemoData } from "@/lib/workspace/store";

/** Classeur .xlsx minimal (chaînes partagées + nombres) pour tester le lecteur sans dépendance. */
function makeXlsx(rows: (string | number)[][], sheetName = "Ventes"): Buffer {
  const shared: string[] = [];
  const idx = (s: string) => (shared.includes(s) ? shared.indexOf(s) : shared.push(s) - 1);
  const col = (i: number) => String.fromCharCode(65 + i);
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (typeof v === "number" ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${idx(v)}</v></c>`)).join("")}</row>`)
    .join("")}</sheetData></worksheet>`;
  const sst = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`;
  return writeZip([
    { name: "[Content_Types].xml", data: "<Types/>" },
    { name: "xl/workbook.xml", data: `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/sharedStrings.xml", data: sst },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]);
}

const okFetch = (payload: unknown): FetchLike => vi.fn(async () => ({ ok: true, status: 200, json: async () => payload }));

describe("entreprise — lecture de fichiers", () => {
  it("CSV : séparateur ;, guillemets, BOM, montants français", () => {
    const t = parseCsv('\uFEFFDate;Client;Montant\r\n01/03/2026;"Boutique ""A""; Akwa";1 250 000\r\n02/03/2026;B;(15 000)\r\n');
    expect(t.headers).toEqual(["Date", "Client", "Montant"]);
    expect(t.rows[0][1]).toBe('Boutique "A"; Akwa');
    expect(parseNumber(t.rows[0][2])).toBe(1250000);
    expect(parseNumber(t.rows[1][2])).toBe(-15000);
    expect(parseNumber("1.250.000,50")).toBe(1250000.5);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("abc")).toBeUndefined();
    expect(toCsv(["a"], [["x;y"]])).toContain('"x;y"');
  });

  it("dates : ISO, JJ/MM/AAAA, mois en lettres, numéro de série Excel", () => {
    expect(parseDate("2026-03-05")).toBe("2026-03-05");
    expect(parseDate("05/03/2026")).toBe("2026-03-05");
    expect(parseDate("mars 2026")).toBe("2026-03-01");
    expect(parseDate("46086")).toBe("2026-03-05");
    expect(parseDate("31/02/2026")).toBeUndefined();
  });

  it("ZIP : aller-retour écriture/lecture", () => {
    const z = writeZip([{ name: "a.txt", data: "bonjour é" }, { name: "d/b.csv", data: "x;y" }]);
    const back = readZip(z);
    expect(back.map((e) => e.name)).toEqual(["a.txt", "d/b.csv"]);
    expect(back[0].data.toString("utf8")).toBe("bonjour é");
  });

  it("XLSX : lecture des chaînes partagées et des nombres", () => {
    const sheets = readXlsx(makeXlsx([["Date", "Client", "Produit", "Quantité", "Montant"], ["2026-03-01", "Akwa & Co", "Livraison", 3, 7500], [46086, "Bali", "Colis", 1, 2500]]));
    expect(sheets[0].name).toBe("Ventes");
    expect(sheets[0].headers).toContain("Montant");
    expect(sheets[0].rows[0]).toEqual(["2026-03-01", "Akwa & Co", "Livraison", "3", "7500"]);
    expect(() => readXlsx(Buffer.from("pas un zip"))).toThrow();
  });

  it("PDF : document valide avec accents", () => {
    const pdf = markdownToPdf("# Titre\n- Trésorerie : 1 000 XAF\n| a | b |\n|---|---|\n| 1 | 2 |", "Rapport été");
    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });
});

describe("entreprise — structuration et analyses", () => {
  it("reconnaît le domaine et les colonnes", () => {
    expect(detectDomain(["Nom", "Département", "Poste", "Salaire brut"])).toBe("rh");
    expect(detectDomain(["Client", "Encours", "Jours de retard"])).toBe("clients");
    expect(detectDomain(["Date", "Client", "Produit", "Quantité", "Montant"])).toBe("ventes");
    expect(detectDomain(["Date", "Libellé", "Débit", "Crédit"])).toBe("finances");
    const ds = structureTable({ headers: ["Date", "Libellé", "Débit", "Crédit"], rows: [["2026-01-05", "Loyer", "250 000", ""], ["2026-01-06", "Vente", "", "400 000"]] }, { companyId: "x", id: "d", name: "n", fileName: "releve.csv", kind: "csv" });
    expect(ds.rows.map((r) => r.montant)).toEqual([-250000, 400000]);
    expect(ds.warnings.join(" ")).toMatch(/combinées/);
  });

  it("seed d'exemple : tableaux de bord, anomalies volontaires détectées", () => {
    const now = new Date("2026-10-19T08:00:00Z");
    const ds = seedDatasets("co_kmerlog", now);
    expect(ds.every((d) => d.isExample)).toBe(true);
    const dash = buildDashboards(ds, now);
    expect(dash.map((d) => d.domain).sort()).toEqual(["clients", "finances", "rh", "ventes"]);
    const an = detectAnomalies(ds, now);
    const kinds = new Set(an.map((a) => a.kind));
    for (const k of ["doublon", "valeur_negative", "valeur_aberrante", "retard_paiement", "concentration", "pic"]) expect(kinds.has(k as never), k).toBe(true);
    expect(an.some((a) => /Marketing/.test(a.title))).toBe(true);
    expect(an.some((a) => /Salaire atypique/.test(a.title))).toBe(true);
    expect(seriesAnomalies([10, 11, 9, 10, 50].map((value, i) => ({ period: `2026-0${i + 1}`, value })))[0].period).toBe("2026-05");
  });

  it("finance : prévision, alertes de trésorerie et stress tests", () => {
    const now = new Date("2026-10-19T08:00:00Z");
    const ds = seedDatasets("co_kmerlog", now);
    const f = computeFinance(ds, seedBudgets("co_kmerlog"), seedSettings("co_kmerlog", now), now);
    expect(f.forecast).toHaveLength(6);
    expect(f.basis).toBe("journal_financier");
    expect(f.isExample).toBe(true);
    expect(f.budget.find((b) => b.category === "Marketing")).toBeDefined();
    const { results, base } = stressTest(ds, seedBudgets("co_kmerlog"), seedSettings("co_kmerlog", now), now);
    expect(results).toHaveLength(6);
    const sev = results.find((r) => r.id === "combine")!;
    expect(sev.endBalance).toBeLessThan(base.forecast.at(-1)!.balance);
    // Un solde d'ouverture faible déclenche une alerte critique.
    const low = computeFinance(ds, [], { ...seedSettings("co_kmerlog", now), openingCash: 0 }, now);
    expect(low.alerts.some((a) => a.severity === "critique")).toBe(true);
  });
});

describe("entreprise — services, outils et exports", () => {
  beforeEach(() => {
    useTempDb();
    process.env.ENTREPRISE_LIVE_SOURCES = "off";
  });

  it("démo : seed présent ; entreprise réelle : vide puis import CSV et XLSX", async () => {
    expect((await dataOverview("co_kmerlog")).datasets.length).toBe(4);
    const co = await createCompany({ name: "Ma PME", sector: "Distribution", legalForm: "SARL", city: "Douala", description: "", ownerName: "Moi", ownerEmail: "moi@example.com", sectorKeywords: ["distribution"] } as never);
    expect((await dataOverview(co.id)).datasets).toHaveLength(0);
    const csv = "Date;Client;Produit;Quantité;Montant\n2026-09-01;A;X;1;1000\n2026-09-02;B;Y;2;2000\n";
    const [d1] = await importData(co.id, { fileName: "ventes-sept.csv", text: csv });
    expect(d1).toMatchObject({ domain: "ventes", rows: 2, isExample: false });
    const xlsx = makeXlsx([["Nom", "Département", "Poste", "Salaire brut"], ["Ali", "Ventes", "Commercial", 200000]], "RH");
    const [d2] = await importData(co.id, { fileName: "personnel.xlsx", base64: xlsx.toString("base64") });
    expect(d2.domain).toBe("rh");
    await expect(importData(co.id, { fileName: "vieux.xls", base64: "AAAA" })).rejects.toThrow(/xlsx/);
    await expect(importData(co.id, { fileName: "vide.csv", text: "  " })).rejects.toThrow(/vide/);
    const o = await dataOverview(co.id);
    expect(o.dashboards.map((d) => d.domain).sort()).toEqual(["rh", "ventes"]);
    await deleteDataset(co.id, d1.id);
    expect((await dataOverview(co.id)).datasets).toHaveLength(1);
    await expect(deleteDataset("co_kmerlog", "ds_seed_co_kmerlog_ventes")).rejects.toThrow(/démonstration/);
    await loadExampleData(co.id);
    expect((await getState(co.id)).datasets.filter((d) => d.isExample).length).toBe(4);
    await updateSettings(co.id, { openingCash: 5000000, fxShare: 2 });
    const st = await getState(co.id);
    expect(st.settings).toMatchObject({ openingCash: 5000000, fxShare: 1, isExample: false });
  });

  it("rapport hebdomadaire : généré, enregistré dans Documents et journalisé (point d'entrée routine)", async () => {
    const r = await generateWeeklyReport("co_kmerlog", { trigger: "routine" });
    expect(r.markdown).toMatch(/Rapport exécutif hebdomadaire/);
    expect(r.markdown).toMatch(/EXEMPLE/);
    const snap = await getSnapshot("co_kmerlog");
    expect(snap.documents.some((d) => d.id === r.documentId)).toBe(true);
    expect(snap.activity.some((a) => a.action === "rapport.hebdomadaire" && a.actor === "routine")).toBe(true);
    expect((await getState("co_kmerlog")).reports).toHaveLength(1);
  });

  it("exports investisseurs / banque / fisc ; le fisc cite le corpus ou marque « exemple »", async () => {
    const inv = await buildFinancialExport("co_kmerlog", "investisseurs");
    expect(inv.markdown).toMatch(/Indicateurs clés/);
    const bank = await buildFinancialExport("co_kmerlog", "banque");
    expect(bank.csv.map((c) => c.name)).toContain("stress-tests.csv");
    const fisc = await buildFinancialExport("co_kmerlog", "fisc");
    expect(fisc.markdown).toMatch(/ne calcule aucun impôt/);
    // Chaque obligation : soit citée (document, page), soit « Non couvert par le corpus officiel ».
    const lines = fisc.markdown.split("\n").filter((l) => /^- \*\*/.test(l));
    expect(lines.length).toBe(4);
    for (const l of lines) expect(l).toMatch(/Non couvert par le corpus officiel|Fondé sur|Partiellement couvert/);
    expect(fisc.markdown).toMatch(/exemple, non officiel/);
  });

  it("due diligence : signaux depuis les données + checklist juridique citée", async () => {
    const dd = await dueDiligence("co_kmerlog", { name: "PharmaDeido" });
    expect(dd.counterparty.kind).toBe("client");
    expect(dd.signals.some((s) => /124 jours de retard/.test(s.label))).toBe(true);
    expect(dd.checklist.length).toBeGreaterThanOrEqual(5);
    for (const c of dd.checklist) expect(["fonde", "partiel", "non_couvert"]).toContain(c.status);
    const inv = await dueDiligence("co_kmerlog", { name: "Diaspora Capital Fund" });
    expect(inv.verdict).not.toBe("favorable");
    const sup = await dueDiligence("co_kmerlog", { id: "sup:sup_moto1" });
    expect(sup.signals.some((s) => /Note annuaire/.test(s.label))).toBe(true);
  });

  it("data room : score, pièces manquantes signalées, ZIP lisible avec PDF", async () => {
    const dr = await buildDataRoom("co_kmerlog");
    expect(dr.sections.find((s) => s.id === "pacte")?.status).toBe("manquant");
    expect(dr.score).toBeGreaterThan(0);
    expect(dr.score).toBeLessThanOrEqual(100);
    const z = dataRoomZip(dr);
    const names = readZip(z.data).map((e) => e.name);
    expect(names.some((n) => n.endsWith("00-index.md"))).toBe(true);
    expect(names.some((n) => n.endsWith("data-room.pdf"))).toBe(true);
    expect(names.some((n) => n.endsWith("chiffres/tresorerie-previsionnelle.csv"))).toBe(true);
  });

  it("profil de risque : 5 axes notés", async () => {
    const r = await riskProfile("co_kmerlog");
    expect(r.axes.map((a) => a.id)).toEqual(["change", "credit_client", "operationnel", "reglementaire", "liquidite"]);
    expect(r.isExample).toBe(true);
    for (const a of r.axes) expect(a.score).toBeGreaterThanOrEqual(0);
  });

  it("appels d'offres : seed exemple filtré par profil, source réelle désactivée proprement", async () => {
    const t = await tenderAlerts("co_kmerlog");
    expect(t.examples.every((e) => e.isExample)).toBe(true);
    expect(t.examples.some((e) => /courses/.test(e.title))).toBe(true);
    expect(t.live.status.live).toBe(false);
    expect(t.portals.length).toBe(2);
    expect(matchKeywords("Livraison de colis express", ["colis"])).toEqual(["colis"]);
  });

  it("outils d'agent enregistrés et exécutables ; aucun n'est une action externe", async () => {
    const names = ["importer_donnees", "tableau_de_bord_donnees", "detecter_anomalies", "rapport_hebdomadaire", "tableau_financier", "exporter_rapport_financier", "veille_sectorielle", "alertes_appels_offres", "profil_risque", "simulation_stress", "due_diligence", "generer_data_room"];
    for (const n of names) expect(TOOL_MAP.get(n), n).toBeDefined();
    expect(names.some((n) => TOOL_MAP.get(n)!.external)).toBe(false);
    const ctx = { companyId: "co_kmerlog", citations: [], groundings: [] };
    const fin = await TOOL_MAP.get("tableau_financier")!.run({}, ctx);
    expect(fin.summary).toMatch(/EXEMPLE/);
    const exp = await TOOL_MAP.get("exporter_rapport_financier")!.run({ cible: "fisc" }, ctx);
    expect((exp.data as { telechargements: { pdf: string } }).telechargements.pdf).toContain("/api/entreprise/export");
    const st = await TOOL_MAP.get("simulation_stress")!.run({ baisse_ventes_pct: 30 }, ctx);
    expect((st.data as { scenarios: unknown[] }).scenarios).toHaveLength(7);
    const imp = await TOOL_MAP.get("importer_donnees")!.run({ nom_fichier: "clients.csv", contenu_csv: "Client;Encours;Jours de retard\nA;100000;10" }, ctx);
    expect(imp.summary).toMatch(/Clients/);
  });

  it("planificateur démo : intentions entreprise, sans demande de devis parasite", async () => {
    expect(detectIntents("Fais la due diligence du fournisseur Douala Moto Distribution")).toContain("ent_dd");
    expect(detectIntents("Fais la due diligence du fournisseur Douala Moto Distribution")).not.toContain("devis");
    expect(detectIntents("Quelle est ma trésorerie prévisionnelle ?")).toContain("ent_finance");
    expect(detectIntents("Prépare la data room investisseur")).toEqual(["ent_dataroom"]);
    expect(detectIntents("Exporte le rapport pour la banque")).toContain("ent_export");
    const snap = await getSnapshot("co_kmerlog");
    const r = await runDemoPlanner(snap.company, "Fais la due diligence du fournisseur Douala Moto Distribution");
    expect(r.toolTrace.map((t) => t.tool)).toEqual(["rechercher_textes_juridiques", "due_diligence"]);
    expect(r.answer).toMatch(/Due diligence/);
    expect((await getSnapshot("co_kmerlog")).approvals).toHaveLength(0);
    const r2 = await runDemoPlanner(snap.company, "Lance une simulation de stress avec une baisse des ventes de 20 %");
    expect(r2.toolTrace.some((t) => t.tool === "simulation_stress" && t.ok)).toBe(true);
  });

  it("réinitialisation de la démo : imports des entreprises de démo purgés, entreprises réelles conservées", async () => {
    await importData("co_kmerlog", { fileName: "x.csv", text: "Date;Montant\n2026-09-01;10" });
    const co = await createCompany({ name: "Réelle", sector: "Commerce", legalForm: "SARL", city: "Douala", description: "", ownerName: "Moi", ownerEmail: "moi@example.com", sectorKeywords: [] } as never);
    await importData(co.id, { fileName: "y.csv", text: "Date;Montant\n2026-09-01;10" });
    await resetDemoData();
    const data = await readData();
    expect(data.entreprise?.datasets.map((d) => d.companyId)).toEqual([co.id]);
  });
});

describe("entreprise — sources publiques réelles (mockées)", () => {
  beforeEach(() => {
    process.env.ENTREPRISE_LIVE_SOURCES = "auto";
    __clearSourceCache();
  });

  it("Banque mondiale : avis de marchés du Cameroun normalisés", async () => {
    const f = okFetch({ procnotices: [{ id: "OP001", notice_type: "Invitation for Bids", noticedate: "14-Oct-2026", submission_deadline_date: "2026-11-23T00:00:00Z", project_ctry_name: "Cameroon", bid_description: "<p>Fourniture de motos</p>", procurement_method_name: "Request for Quotations", contact_organization: "Projet X" }] });
    const r = await fetchWorldBankTenders("CM", 5, f);
    expect(r.status.live).toBe(true);
    expect(r.items[0]).toMatchObject({ id: "OP001", title: "Fourniture de motos", deadline: "2026-11-23", source: "Banque mondiale" });
    expect(r.items[0].url).toContain("procurement-detail/OP001");
    expect((f as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toContain("project_ctry_code=CM");
  });

  it("bascule en démo si la source échoue", async () => {
    const failing: FetchLike = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const r = await fetchWorldBankTenders("CM", 5, failing);
    expect(r.status.live).toBe(false);
    expect(r.items).toEqual([]);
    expect(r.status.error).toMatch(/503/);
  });

  it("indicateurs macroéconomiques", async () => {
    const f = okFetch([{ page: 1 }, [{ date: "2025", value: 3.4037 }]]);
    const r = await fetchWorldBankIndicators("CM", f);
    expect(r.status.live).toBe(true);
    expect(r.items[0]).toMatchObject({ id: "FP.CPI.TOTL.ZG", year: "2025", value: 3.4 });
  });
});
