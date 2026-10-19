import { describe, expect, it } from "vitest";
import { computeCompliance, regulatoryWatch } from "@/lib/compliance";
import { getArticles } from "@/lib/legal/citations";
import { loadExampleCorpus, searchLegalCorpus } from "@/lib/legal/corpus";
import { buildChecklist, buildObligations } from "@/lib/workspace/seed";
import { parseFrontMatter, splitArticles } from "../scripts/ingest-corpus.mjs";

describe("juridique", () => {
  it("extrait les numéros d'articles", () => {
    expect(getArticles("ARTICLE 34.- La licence … Article 38 bis")).toEqual(["34", "38 bis"]);
  });

  it("le seed d'exemple est intégralement marqué non officiel", async () => {
    const chunks = await loadExampleCorpus();
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.isExample).toBe(true);
      expect(c.title).toMatch(/EXEMPLE/);
      expect(c.title).toMatch(/non officiel/);
    }
  });

  it("une question sur la création d'entreprise ressort des exemples signalés", async () => {
    const res = await searchLegalCorpus("formalités immatriculation création société statuts guichet unique", 5);
    const examples = res.citations.filter((c) => c.isExample);
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.every((c) => c.title.includes("EXEMPLE"))).toBe(true);
  });

  it("ingestion : front-matter et découpage par article", () => {
    const { meta, body } = parseFrontMatter("---\ntitre: Loi test\ncategorie: Lois\n---\nArticle 1 — A.\nArticle 2 — B.");
    expect((meta as Record<string, string>).titre).toBe("Loi test");
    expect(splitArticles(body)).toHaveLength(2);
  });

  it("score de conformité borné et recommandations", () => {
    const score = computeCompliance(buildChecklist("c", 3), buildObligations("c", true), []);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.recommendations.some((r) => r.includes("Prochaine démarche"))).toBe(true);
  });

  it("veille : priorise les textes pertinents", () => {
    const alerts = regulatoryWatch(["postal"], [
      { source: "reglementation/Lois/a.pdf", title: "Loi postale", category: "Lois", sample: "activité postale postal" },
      { source: "publications/x.pdf", title: "Rapport", category: "rapports", sample: "rien" },
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("Loi postale");
  });
});
