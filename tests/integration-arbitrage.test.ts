import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { runDemoPlanner } from "@/lib/agent/demo-planner";
import { __clearCache, readData, withData } from "@/lib/workspace/store";

describe("intégration : arbitrage data room / financements", () => {
  beforeEach(useTempDb);
  it("« Prépare la data room investisseur » ne déclenche pas l'éligibilité aux financements", async () => {
    const company = (await readData()).companies.find((c) => c.id === "co_kmerlog")!;
    const res = await runDemoPlanner(company, "Prépare la data room investisseur");
    const tools = res.toolTrace.map((t) => t.tool);
    expect(tools.some((t) => /dataroom|data_room/.test(t))).toBe(true);
    expect(tools).not.toContain("fund_evaluer_eligibilite");
  });
});

describe("store : concurrence sur base vierge", () => {
  beforeEach(useTempDb);
  it("lectures et écritures simultanées : un seul seed, aucun ENOENT, aucun fichier tmp résiduel", async () => {
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => readData()),
      withData((d) => d.companies.length),
      readData(),
    ]);
    expect(results).toHaveLength(10);
    const file = process.env.WORKSPACE_DB_PATH!;
    expect(JSON.parse(await readFile(file, "utf8")).companies.length).toBeGreaterThan(0);
    expect(readdirSync(path.dirname(file)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("deux « instances » (caches distincts) qui écrivent en même temps ne se gênent pas", async () => {
    await readData();
    const a = withData((d) => { d.tasks.push({ ...d.tasks[0], id: "tsk_a" }); });
    __clearCache(); // simule une seconde instance serverless
    const b = withData((d) => { d.tasks.push({ ...d.tasks[0], id: "tsk_b" }); });
    await expect(Promise.all([a, b])).resolves.toBeDefined();
  });

  it("un fichier corrompu est mis de côté, pas écrasé silencieusement", async () => {
    const file = process.env.WORKSPACE_DB_PATH!;
    await writeFile(file, "{ pas du json");
    __clearCache();
    expect((await readData()).companies.length).toBeGreaterThan(0);
    expect(readdirSync(path.dirname(file)).some((f) => f.includes(".corrompu-"))).toBe(true);
  });
});
