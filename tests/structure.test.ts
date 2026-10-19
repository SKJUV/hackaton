import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { TOOL_MAP } from "@/lib/agent/registry";
import { runDemoPlanner } from "@/lib/agent/demo-planner";
import { LEGAL_FORMS } from "@/lib/modules/structure/catalog";
import { chooseStructure, generatePacte, recommendStructure, registrationGuide, scoreForms, simulateCreation, validatePacte, vestingSchedule } from "@/lib/modules/structure/service";
import { readData } from "@/lib/workspace/store";

const CO = "co_kmerlog";

describe("structure : choix guidé (logique pure)", () => {
  it("un fondateur seul n'obtient que des formes unipersonnelles éligibles", () => {
    const r = scoreForms({ founders: 1, wantsInvestors: true, limitedLiability: true, budget: "moyen", wantsFlexibility: true });
    expect(r[0].form).toBe("SASU");
    expect(r.find((x) => x.form === "SARL")!.eligible).toBe(false);
  });
  it("plusieurs fondateurs qui lèvent des fonds → SAS ; petit budget sans investisseur → SARL", () => {
    expect(scoreForms({ founders: 3, wantsInvestors: true, limitedLiability: true, budget: "moyen", wantsFlexibility: true })[0].form).toBe("SAS");
    expect(scoreForms({ founders: 2, wantsInvestors: false, limitedLiability: true, budget: "faible", wantsFlexibility: false })[0].form).toBe("SARL");
    expect(scoreForms({ founders: 3, wantsInvestors: false, limitedLiability: false, budget: "faible", wantsFlexibility: false, pooling: true })[0].form).toBe("GIE");
  });
  it("le catalogue marque coûts/délais comme exemples et renvoie au corpus", () => {
    for (const f of LEGAL_FORMS) {
      expect(f.capitalRepere).toMatch(/confirmer/);
      expect(f.legalQuery.length).toBeGreaterThan(10);
    }
  });
});

describe("structure : vesting", () => {
  const a = [{ name: "A", percent: 60 }, { name: "B", percent: 40 }];
  it("rien avant le cliff, 25 % au cliff de 12/48, 100 % à la fin", () => {
    const s = vestingSchedule(a, 48, 12);
    expect(s[0].byAssociate.A).toBe(0);
    expect(s.find((r) => r.month === 12)!.byAssociate.A).toBe(15);
    expect(s.find((r) => r.month === 24)!.byAssociate.B).toBe(20);
    expect(s.at(-1)!.byAssociate).toEqual({ A: 60, B: 40 });
  });
  it("valide la répartition", () => {
    expect(() => validatePacte({ associates: [{ name: "A", percent: 60 }, { name: "B", percent: 30 }] })).toThrow(/100 %/);
    expect(() => validatePacte({ associates: [{ name: "A", percent: 100 }] })).toThrow(/deux associés/);
    expect(validatePacte({ associates: a }).cliffMonths).toBe(12);
  });
});

describe("structure : services ancrés", () => {
  beforeEach(useTempDb);

  it("recommandation ancrée, décision mémorisée et tracée", async () => {
    const r = await recommendStructure(CO, { founders: 2, wantsInvestors: true, limitedLiability: true, budget: "moyen", wantsFlexibility: true });
    expect(r.top[0].basis?.label).toBeTruthy();
    expect(r.notice).toMatch(/non couverts par le corpus/);
    await chooseStructure(CO, "SAS", "test", "levée prévue");
    const d = await readData();
    expect(d.companies.find((c) => c.id === CO)!.legalForm).toBe("SAS");
    expect(d.activity.some((x) => x.action === "structure.choix" && /levée prévue/.test(x.details))).toBe(true);
    expect((d.modules?.structure as { choices: { chosen?: string }[] }).choices.at(-1)!.chosen).toBe("SAS");
  });

  it("simulateur : colonnes par forme, coûts d'exemple, catégories sourcées", async () => {
    const r = await simulateCreation(CO, ["SARL", "SAS", "SARL"]);
    expect(r.columns.map((c) => c.form)).toEqual(["SARL", "SAS"]);
    expect(r.columns[0].isExample).toBe(true);
    expect(r.columns[0].rows.map((x) => x.category)).toContain("sectoriel");
    expect(r.columns[0].rows.every((x) => ["fonde", "partiel", "non_couvert"].includes(x.basis.status))).toBe(true);
  });

  it("pacte d'associés : document à relire, fondement juridique et empreinte du corpus", async () => {
    const r = await generatePacte(CO, { associates: [{ name: "Awa", percent: 55 }, { name: "Paul", percent: 45 }], vestingMonths: 36, cliffMonths: 6 });
    expect(r.document.needsReview).toBe(true);
    expect(r.document.kind).toBe("contrat");
    expect(r.document.content).toContain("Fondement juridique (corpus officiel)");
    expect(r.document.content).toContain("| Cliff (6 mois) |");
    expect(r.document.content).toMatch(/Trame d'exemple/);
    expect(r.document.legalSources?.length).toBeGreaterThan(0);
  });

  it("guide d'immatriculation : étapes d'exemple ancrées, tâches optionnelles", async () => {
    const before = (await readData()).tasks.length;
    const r = await registrationGuide(CO, "EI", { createTasks: true });
    expect(r.steps.some((s) => /capital/i.test(s.title))).toBe(false);
    expect(r.steps.every((s) => s.isExample && s.basis.label)).toBe(true);
    expect((await readData()).tasks.length).toBe(before + r.steps.length);
    const sas = await registrationGuide(CO, "SAS");
    expect(sas.steps.some((s) => /capital/i.test(s.title))).toBe(true);
    expect(sas.taskIds).toHaveLength(0);
  });

  it("outils agent et intentions du planificateur démo", async () => {
    for (const t of ["structure_recommander", "structure_choisir", "structure_simuler_creation", "structure_generer_pacte", "structure_guide_immatriculation"]) expect(TOOL_MAP.has(t)).toBe(true);
    const ctx = { companyId: CO, citations: [] };
    const pacte = await TOOL_MAP.get("structure_generer_pacte")!.run({}, ctx);
    expect(pacte.summary).toMatch(/Pacte d'associés/);
    expect(ctx.citations.length).toBeGreaterThan(0);
    const company = (await readData()).companies.find((c) => c.id === CO)!;
    const res = await runDemoPlanner(company, "Quelle forme juridique choisir : SARL ou SAS ?");
    expect(res.answer).toMatch(/Choix de la structure/);
    expect(res.toolTrace.some((t) => t.tool === "structure_recommander")).toBe(true);
  });
});
