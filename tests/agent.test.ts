import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { detectIntents, extractPurpose } from "@/lib/agent/demo-planner";
import { runAgent } from "@/lib/agent/runner";
import { TOOLS } from "@/lib/agent/tools";
import { getSnapshot } from "@/lib/workspace/service";

describe("agent", () => {
  beforeEach(useTempDb);

  it("détecte les intentions principales", () => {
    expect(detectIntents("Demande des devis pour 10 motos")).toContain("devis");
    expect(detectIntents("Envoie un mail à a@b.com")).toContain("email");
    expect(detectIntents("Génère nos statuts")).toContain("document");
    expect(detectIntents("Quelle licence pour un service postal ?")).toContain("juridique");
    expect(detectIntents("bonjour")).toEqual(["juridique"]);
  });

  it("extrait l'objet d'un email", () => {
    expect(extractPurpose("Envoie un mail à x@y.com pour demander un rendez-vous")).toBe("demander un rendez-vous");
  });

  it("tous les outils ont un schéma objet et une description", () => {
    for (const tool of TOOLS) {
      expect(tool.parameters.type).toBe("object");
      expect(tool.description.length).toBeGreaterThan(20);
    }
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });

  it("mode démo sans clé : l'agent agit via les outils et passe par l'approbation", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Trouve des fournisseurs de motos et demande des devis" }]);
    expect(reply.mode).toBe("demo");
    expect(reply.toolTrace.map((t) => t.tool)).toEqual(["lister_fournisseurs", "demander_devis"]);
    const snap = await getSnapshot("co_kmerlog");
    expect(snap.approvals.filter((a) => a.status === "en_attente").length).toBeGreaterThan(0);
    expect(snap.emails.every((e) => e.status === "en_attente_approbation")).toBe(true);
  });

  it("documents générés : statuts marqués à valider", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    await runAgent(company, [{ role: "user", content: "Génère les statuts de la société" }]);
    const snap = await getSnapshot("co_kmerlog");
    const statuts = snap.documents.find((d) => d.kind === "statuts");
    expect(statuts?.needsReview).toBe(true);
    expect(statuts?.content).toMatch(/professionnel du droit/);
  });
});
