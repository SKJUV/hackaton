import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { runAgent } from "@/lib/agent/runner";
import { assessCoverage, groundingLabel, groundingMarkdown, significantTerms, type Grounding } from "@/lib/legal/grounding";
import { getSnapshot } from "@/lib/workspace/service";

describe("ancrage juridique : couverture", () => {
  it("ignore les mots génériques", () => {
    expect(significantTerms("Comment créer une entreprise au Cameroun ?")).toEqual([]);
    expect(significantTerms("licence opérateur internet")).toEqual(["licence", "operateur", "internet"]);
  });

  it("fondé / partiel / non couvert", () => {
    const text = "Article 9 : l'établissement et l'exploitation des réseaux sont soumis à licence. L'opérateur titulaire d'une licence internet…";
    expect(assessCoverage("licence opérateur internet", [text]).status).toBe("fonde");
    expect(assessCoverage("licence opérateur importation motos", [text]).status).toBe("partiel");
    // un seul terme commun sur plusieurs ne suffit pas (ex. « recette » ≈ « recettes » fiscales)
    expect(assessCoverage("licence importation", [text]).status).toBe("non_couvert");
    expect(assessCoverage("recette du ndolé", [text]).status).toBe("non_couvert");
    expect(assessCoverage("licence opérateur", []).status).toBe("non_couvert");
  });

  it("libellé et section Markdown n'inventent rien quand rien ne couvre", () => {
    const g: Grounding = { query: "recette du ndolé", status: "non_couvert", coverage: 0, matchedTerms: [], sources: [], citations: [], indexReady: true };
    expect(groundingLabel(g)).toBe("Non couvert par le corpus officiel");
    expect(groundingMarkdown(g)).toMatch(/Non couvert par le corpus officiel/);
    const ok: Grounding = { ...g, status: "fonde", sources: [{ id: "S1", document: "Loi X", page: 4, articles: ["9"], file: "a.pdf", isExample: false }] };
    expect(groundingLabel(ok)).toBe("Fondé sur : Loi X, p. 4, art. 9");
    expect(groundingMarkdown(ok)).toMatch(/\[S1\] Loi X — page 4, art\. 9/);
  });
});

describe("ancrage juridique : agent (mode démo)", () => {
  beforeEach(useTempDb);

  it("la recherche juridique précède toujours les actions et la réponse commence par la base juridique", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Génère un business plan" }]);
    expect(reply.toolTrace[0].tool).toBe("rechercher_textes_juridiques");
    expect(reply.answer).toMatch(/^\*\*Base juridique/);
    expect(reply.grounding).not.toBeNull();
    expect(reply.grounding!.actions.length).toBeGreaterThan(0);
    const snap = await getSnapshot("co_kmerlog");
    expect(snap.documents.find((d) => d.kind === "business_plan")!.content).toMatch(/## Fondement juridique \(corpus officiel\)/);
  });

  it("dit « non couvert » au lieu d'inventer", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Quelle est la recette traditionnelle du ndolé aux crevettes ?" }]);
    expect(reply.grounding?.status).toBe("non_couvert");
    expect(reply.answer).toMatch(/non couverte par le corpus officiel/);
  });

  it("démarches présentées comme étapes juridiques sourcées", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Quelles sont les démarches de création ?" }]);
    const step = reply.toolTrace.find((t) => t.tool === "checklist_creation_entreprise");
    expect(step?.ok).toBe(true);
    expect(reply.answer).toMatch(/Étapes juridiques/);
    expect(reply.answer).toMatch(/1\. .+ — (Fondé sur|Partiellement couvert|⚠️ non couvert)/);
  });
});

describe("intentions", () => {
  it("« fournisseur d'accès internet » n'est pas une demande d'achat", async () => {
    const { detectIntents } = await import("@/lib/agent/demo-planner");
    expect(detectIntents("Quelle licence pour devenir fournisseur d'accès internet ?")).not.toContain("devis");
    expect(detectIntents("Trouve des fournisseurs de cartons")).toContain("devis");
  });
});
