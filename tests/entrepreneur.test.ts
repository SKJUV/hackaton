import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { ALL_TOOLS, AGENT_MODULES } from "@/lib/agent/registry";
import { runAgent } from "@/lib/agent/runner";
import { evaluateProgram } from "@/lib/modules/entrepreneur/eligibility";
import { followUpApplication, matchPrograms, prepareApplication, updateApplication, updateProfile } from "@/lib/modules/entrepreneur/funding";
import { analyzeIdea } from "@/lib/modules/entrepreneur/idea";
import { requestMarketQuotes, searchMarket } from "@/lib/modules/entrepreneur/market";
import { matchMentors, requestIntro } from "@/lib/modules/entrepreneur/network";
import { ALL_PROGRAMS, EXAMPLE_PROGRAMS, getProgram, REAL_PROGRAMS } from "@/lib/modules/entrepreneur/programs";
import { detectEntrepreneurIntents } from "@/lib/modules/entrepreneur/demo";
import { ENTREPRENEUR_TOOLS, entrepreneurSnapshot, runEntrepreneurAction } from "@/lib/modules/entrepreneur/tools";
import type { Ctx } from "@/lib/modules/entrepreneur/types";
import { webSearch } from "@/lib/modules/entrepreneur/websearch";
import { getSnapshot } from "@/lib/workspace/service";

const ctx = (companyId = "co_kmerlog"): Ctx => ({ companyId, citations: [], groundings: [] });

describe("entrepreneur — base de programmes", () => {
  it("programmes réels : source https, date de vérification, jamais marqués exemple", () => {
    expect(REAL_PROGRAMS.length).toBeGreaterThanOrEqual(8);
    for (const p of REAL_PROGRAMS) {
      expect(p.verified).toBe(true);
      expect(p.isExample).toBe(false);
      expect(p.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sources.length).toBeGreaterThan(0);
      for (const s of p.sources) expect(s).toMatch(/^https:\/\//);
    }
  });
  it("programmes seedés : marqués exemple, non vérifiés, adresses example.com", () => {
    for (const p of EXAMPLE_PROGRAMS) {
      expect(p.isExample).toBe(true);
      expect(p.verified).toBe(false);
      expect(p.name).toMatch(/exemple/i);
      expect(p.contactEmail ?? "x@example.com").toMatch(/example\.com$/);
    }
    expect(new Set(ALL_PROGRAMS.map((p) => p.id)).size).toBe(ALL_PROGRAMS.length);
  });
});

describe("entrepreneur — éligibilité", () => {
  beforeEach(useTempDb);

  it("explique chaque critère : exclusion sectorielle FNE pour une activité de livraison", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const fne = evaluateProgram(getProgram("fne-cameroun")!, company, undefined);
    expect(fne.verdict).toBe("non_eligible");
    expect(fne.results.find((r) => r.status === "ko")?.detail).toMatch(/livraison|transport/);
    const mest = evaluateProgram(getProgram("mest-africa-challenge")!, company, undefined);
    expect(mest.results[0].status).toBe("ko");
  });

  it("inconnu → à vérifier ; critère de source secondaire → jamais « non éligible »", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const tef = getProgram("tef-entrepreneurship")!;
    expect(evaluateProgram(tef, company, { companyId: company.id, updatedAt: "" }).results.find((r) => r.label.includes("18 ans"))?.status).toBe("a_verifier");
    const old = evaluateProgram(tef, company, { companyId: company.id, yearsOperating: 9, founderAge: 30, updatedAt: "" });
    expect(old.verdict).not.toBe("non_eligible");
    expect(old.results.find((r) => r.label.includes("5 ans"))?.status).toBe("a_verifier");
  });

  it("le profil met à jour le matching", async () => {
    await updateProfile("co_kmerlog", { yearsOperating: 1, isRegistered: true, hasRevenue: true });
    const r = await matchPrograms("co_kmerlog");
    const abh = r.rows.find((x) => x.program.id === "africa-business-heroes")!;
    expect(abh.eligibility.results.find((x) => x.label.includes("3 ans"))?.status).toBe("ko");
  });
});

describe("entrepreneur — idée", () => {
  beforeEach(useTempDb);

  it("diagnostic honnête : faiblesses, obstacles par thème, score plafonné, aucun concurrent inventé sans recherche web", async () => {
    const c = ctx();
    const d = await analyzeIdea("co_kmerlog", { idea: "Livraison de colis par motos pour les e-commerçants de Douala avec suivi en temps réel." }, c);
    expect(d.score).toBeLessThanOrEqual(85);
    expect(d.weaknesses.length).toBeGreaterThan(0);
    expect(d.obstacles.map((o) => o.theme)).toContain("Activité postale (courrier, colis, express)");
    for (const o of d.obstacles) if (o.status === "non_couvert") expect(o.articles).toEqual([]);
    for (const o of d.obstacles) for (const a of o.articles) expect(c.citations.some((x) => x.id === a.source && !x.isExample)).toBe(true);
    expect(d.competitorsMode).toBe("demo");
    expect(d.competitors.every((x) => x.kind !== "web")).toBe(true);
    expect(d.pivots.length).toBeGreaterThan(0);
  });

  it("recherche web réelle (Brave) branchée et testée avec un mock", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    const fake = (async (url: string, init?: RequestInit) => {
      expect(url).toContain("api.search.brave.com");
      expect((init?.headers as Record<string, string>)["X-Subscription-Token"]).toBe("test-key");
      return new Response(JSON.stringify({ web: { results: [{ title: "<b>Acme</b> Livraison", url: "https://acme.example.com", description: "Livraison" }] } }), { status: 200 });
    }) as typeof fetch;
    const r = await webSearch("livraison Douala", 5, fake);
    delete process.env.BRAVE_SEARCH_API_KEY;
    expect(r.mode).toBe("web");
    expect(r.results[0]).toEqual({ title: "Acme Livraison", url: "https://acme.example.com", description: "Livraison" });
    expect((await webSearch("x")).mode).toBe("demo");
  });
});

describe("entrepreneur — financement : dossier, suivi, relance via approbation", () => {
  beforeEach(useTempDb);

  it("prépare le dossier, suit la soumission et place la relance en approbation sans rien envoyer", async () => {
    const r = await prepareApplication("co_kmerlog", "orange-poesam", ctx(), "", "utilisateur");
    const snap = await getSnapshot("co_kmerlog");
    const doc = snap.documents.find((d) => d.id === r.documentId)!;
    expect(doc.needsReview).toBe(true);
    expect(doc.content).toContain("vérifié le");
    expect(doc.content).toContain("Fondement juridique");
    await expect(followUpApplication("co_kmerlog", r.application.id, {})).rejects.toThrow(/soumises/);
    await updateApplication("co_kmerlog", r.application.id, { status: "soumise" });
    expect((await getSnapshot("co_kmerlog")).tasks.some((t) => t.title.includes("Relancer"))).toBe(true);
    const f = await followUpApplication("co_kmerlog", r.application.id, {});
    const after = await getSnapshot("co_kmerlog");
    expect(after.approvals.find((a) => a.id === f.approvalId)?.status).toBe("en_attente");
    expect(after.emails.find((e) => e.id === f.emailId)?.status).toBe("en_attente_approbation");
    // Jamais de vrai contact pendant le dev : l'adresse officielle d'Orange est remplacée par une adresse de démo.
    expect(f.officialContact).toBe("support.poesam@orange.com");
    expect(after.emails.find((e) => e.id === f.emailId)?.to).toEqual(["programme-orange-poesam@demo.example.com"]);
    expect(after.approvals.find((a) => a.id === f.approvalId)?.module).toBe("fund");
  });
});

describe("entrepreneur — mentors et marché B2B", () => {
  beforeEach(useTempDb);

  it("matching par secteur/compétences et mise en relation soumise à approbation (une seule en attente)", async () => {
    const m = await matchMentors("co_kmerlog");
    expect(m.rows[0].mentor.isExample).toBe(true);
    expect(m.rows[0].sectorHits.length + m.rows[0].skillHits.length).toBeGreaterThan(0);
    const r = await requestIntro("co_kmerlog", { mentorId: m.rows[0].mentor.id });
    expect((await getSnapshot("co_kmerlog")).approvals.find((a) => a.id === r.approvalId)?.status).toBe("en_attente");
    await expect(requestIntro("co_kmerlog", { mentorId: m.rows[0].mentor.id })).rejects.toThrow(/attend déjà/);
  });

  it("compatibilité + solidité (exemple) et devis via le flux d'approbation existant", async () => {
    const c = ctx();
    const r = await searchMarket({ need: "sacs de livraison", city: "Douala" }, c);
    expect(r.rows[0].supplier.id).toBe("sup_emb1");
    expect(r.rows[0].solidityData.isExample).toBe(true);
    expect(r.rows[0].solidity).toBeLessThan(r.rows[1].solidity);
    expect(r.avertissement).toMatch(/EXEMPLE/);
    const q = await requestMarketQuotes("co_kmerlog", { supplierIds: ["sup_emb1"], need: "sacs de livraison" }, c);
    expect(q.created[0].quote.status).toBe("en_attente_approbation");
  });
});

describe("entrepreneur — outils de l'agent", () => {
  beforeEach(useTempDb);

  it("toutes les actions sont des outils de l'agent, noms uniques, schémas objets", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    for (const id of ["idea", "fund", "team", "mentor", "market"]) {
      const mod = AGENT_MODULES.find((m) => m.id === id)!;
      expect(mod.tools.length).toBeGreaterThan(0);
      for (const t of mod.tools) expect(t.name.startsWith(`${id}_`)).toBe(true);
      expect(mod.intents?.length).toBe(1);
    }
    expect(new Set(names).size).toBe(names.length);
    for (const t of ENTREPRENEUR_TOOLS) {
      expect(names).toContain(t.name);
      expect(t.parameters.type).toBe("object");
    }
    for (const n of ["fund_relancer_programme", "mentor_demander_mise_en_relation", "market_demander_devis"]) expect(ENTREPRENEUR_TOOLS.find((t) => t.name === n)?.external).toBe(true);
  });

  it("intentions du mode démo", () => {
    expect(detectEntrepreneurIntents("Trouve des financements et subventions")).toContain("financement");
    expect(detectEntrepreneurIntents("Analyse mon idée et mes concurrents")).toContain("idee");
    expect(detectEntrepreneurIntents("Il me manque un cofondateur, rédige la fiche de poste")).toContain("equipe");
    expect(detectEntrepreneurIntents("Je cherche un mentor")).toContain("mentor");
    expect(detectEntrepreneurIntents("place de marché B2B")).toContain("b2b");
  });

  it("mode démo sans clé : l'agent appelle les outils du module après la recherche juridique", async () => {
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Quels financements pour mon projet ? Et trouve-moi un mentor." }]);
    const tools = reply.toolTrace.map((t) => t.tool);
    expect(tools[0]).toBe("rechercher_textes_juridiques");
    expect(tools).toContain("fund_evaluer_eligibilite");
    expect(tools).toContain("mentor_rechercher");
    expect(reply.answer).toMatch(/Financements/);
  });

  it("API : action inconnue → 404 ; instantané du module", async () => {
    await expect(runEntrepreneurAction("inexistante", "co_kmerlog", {}, {})).rejects.toThrow(/inconnue/);
    const snap = await entrepreneurSnapshot("co_kmerlog");
    expect(snap.programs.length).toBe(ALL_PROGRAMS.length);
    expect(snap.jobs[0].alerts.length).toBeGreaterThan(0);
  });
});
