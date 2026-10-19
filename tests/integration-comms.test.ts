import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { detectIntents, runDemoPlanner } from "@/lib/agent/demo-planner";
import { NAV } from "@/components/workspace/module-catalog";
import { readData } from "@/lib/workspace/store";

describe("intégration mcp : boîte unifiée prioritaire sur la rédaction d'email", () => {
  it("« mes emails reçus » ne déclenche pas l'intention email du cœur", () => {
    expect(detectIntents("Montre-moi mes emails reçus")).not.toContain("email");
    expect(detectIntents("Résume ma boîte de réception")).not.toContain("email");
    expect(detectIntents("Écris à contact@demo.example.com pour un rendez-vous")).toContain("email");
  });

  it("l'onglet comms est attribué à l'équipe mcp-connecteurs", () => {
    expect(NAV.find((n) => n.id === "comms")?.team).toBe("mcp-connecteurs");
  });

  describe("planificateur démo", () => {
    beforeEach(useTempDb);
    it("aucun brouillon d'email n'est créé pour une consultation de la boîte", async () => {
      const company = (await readData()).companies.find((c) => c.id === "co_kmerlog")!;
      const before = (await readData()).approvals.length;
      const res = await runDemoPlanner(company, "Montre-moi mes emails reçus");
      expect(res.toolTrace.some((t) => t.tool === "rediger_email")).toBe(false);
      expect((await readData()).approvals.length).toBe(before);
    });
  });
});
