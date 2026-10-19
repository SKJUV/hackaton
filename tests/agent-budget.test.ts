import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./setup-db";
import { ALL_TOOLS, AGENT_MODULES } from "@/lib/agent/registry";
import { buildOpenAIRequest, estimateTokens, MAX_INPUT_TOKENS, preGround, runAgent, selectFor, fitBudget } from "@/lib/agent/runner";
import { ALWAYS, MAX_TOOLS, selectTools } from "@/lib/agent/tool-selection";
import type { ToolContext } from "@/lib/agent/tools";
import type { ToolTrace } from "@/lib/workspace/types";
import { readData } from "@/lib/workspace/store";

const names = (msg: string, previous: string[] = []) => selectTools(msg, ALL_TOOLS, { previous }).tools.map((t) => t.name);

describe("sélection des outils par requête", () => {
  it("noyau toujours présent, ≤ 15 outils, charger_outils disponible", () => {
    for (const msg of ["Bonjour", "Prépare la data room investisseur et un rapport financier", "Quelle forme juridique, un pacte d'associés et des financements ?"]) {
      const n = names(msg);
      expect(n.length).toBeLessThanOrEqual(MAX_TOOLS);
      for (const a of ALWAYS) expect(n).toContain(a);
      expect(n).toContain("charger_outils");
    }
  });
  it("chaque demande obtient les outils de son module", () => {
    expect(names("Quels financements ou subventions pour mon projet ?")).toContain("fund_evaluer_eligibilite");
    expect(names("Prépare la data room investisseur")).toContain("entreprise_generer_data_room");
    expect(names("Rédige une fiche de poste pour recruter un développeur")).toContain("team_rediger_fiche_de_poste");
    expect(names("Simule l'impact d'une politique publique sur l'inflation")).toContain("etat_simuler_politique");
    expect(names("Qu'ai-je manqué pendant la réunion ?")).toContain("memoire_ce_que_jai_manque");
    expect(names("SARL ou SAS ? Prépare aussi le pacte avec vesting")).toEqual(expect.arrayContaining(["structure_recommander", "structure_generer_pacte"]));
    expect(names("Demande des devis à des fournisseurs de cartons")).toEqual(expect.arrayContaining(["lister_fournisseurs", "demander_devis"]));
    expect(names("Montre ma boîte de réception unifiée")).toContain("connecteurs_boite_unifiee");
    expect(names("Le corpus a été mis à jour : un changement de loi touche-t-il mes documents ?")).toContain("loi_verifier_changements");
  });
  it("relance courte : les outils du message précédent restent disponibles", () => {
    expect(names("oui, vas-y", ["Trouve des mentors en fintech"])).toContain("mentor_demander_mise_en_relation");
  });
  it("tous les outils sont atteignables par au moins une formulation ou via charger_outils", () => {
    const load = selectTools("x", ALL_TOOLS).tools.find((t) => t.name === "charger_outils")!;
    const enumIds = ((load.parameters.properties.module as { enum: string[] }).enum);
    for (const m of AGENT_MODULES) expect(enumIds).toContain(m.id);
  });
});

describe("budget de jetons par requête (palier gratuit Groq 8 000 jetons/min)", () => {
  beforeEach(useTempDb);
  const cases = [
    "Comment obtenir une licence d'opérateur de communications électroniques ?",
    "Prépare la data room investisseur et vérifie la conformité fiscale",
    "Quelle forme juridique choisir, prépare un pacte d'associés avec vesting et trouve des financements",
    "Rédige une fiche de poste, filtre les candidatures et propose des mentors",
  ];
  for (const q of cases) {
    it(`< ${MAX_INPUT_TOKENS} jetons : « ${q.slice(0, 40)}… »`, async () => {
      const company = (await readData()).companies[0];
      const ctx: ToolContext = { companyId: company.id, citations: [], groundings: [] };
      const trace: ToolTrace[] = [];
      const grounding = await preGround(q, ctx, trace);
      const long = "historique ".repeat(600);
      const history = [{ role: "user" as const, content: long }, { role: "assistant" as const, content: long }, { role: "user" as const, content: q }];
      const { messages, schemas } = buildOpenAIRequest(company, history, grounding, selectFor(history, ctx).tools);
      const total = estimateTokens(messages) + estimateTokens(schemas);
      expect(total).toBeLessThan(MAX_INPUT_TOKENS);
      expect(total).toBeLessThan(4500); // marge pour les étapes d'outils suivantes
    });
  }
  it("les résultats d'outils volumineux sont réduits pour tenir dans le budget", () => {
    const msgs: Record<string, unknown>[] = [{ role: "system", content: "s" }, ...Array.from({ length: 6 }, (_, i) => ({ role: "tool", tool_call_id: String(i), content: "x".repeat(5000) })), { role: "user", content: "q" }];
    fitBudget(msgs, []);
    expect(estimateTokens(msgs)).toBeLessThan(MAX_INPUT_TOKENS);
  });
});

describe("repli démo avec avertissement sur 413 / 429", () => {
  beforeEach(useTempDb);
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
  });
  it("Groq 413 rate_limit_exceeded → mode démo + avertissement de quota", async () => {
    process.env.GROQ_API_KEY = "cle-de-test-fictive";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limit_exceeded", message: "Request too large" } }), { status: 413 }));
    vi.stubGlobal("fetch", fetchMock);
    const company = (await readData()).companies[0];
    const reply = await runAgent(company, [{ role: "user", content: "Liste mes tâches" }]);
    expect(reply.mode).toBe("demo");
    expect(reply.notice).toMatch(/Quota du fournisseur IA dépassé/);
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.tools.length).toBeLessThanOrEqual(MAX_TOOLS);
    expect(estimateTokens(sent.messages) + estimateTokens(sent.tools)).toBeLessThan(MAX_INPUT_TOKENS);
  });
  it("charger_outils ajoute les outils d'un module à l'étape suivante", async () => {
    process.env.GROQ_API_KEY = "cle-de-test-fictive";
    const bodies: { tools: { function: { name: string } }[] }[] = [];
    let step = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      step += 1;
      const message = step === 1
        ? { content: "", tool_calls: [{ id: "c1", function: { name: "charger_outils", arguments: JSON.stringify({ module: "etat" }) } }] }
        : { content: "Base juridique : non couvert par le corpus officiel. Voici la suite." };
      return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
    }));
    const company = (await readData()).companies[0];
    const reply = await runAgent(company, [{ role: "user", content: "Bonjour" }]);
    expect(reply.mode).toBe("llm");
    expect(bodies[0].tools.map((t) => t.function.name)).not.toContain("etat_simuler_politique");
    expect(bodies[1].tools.map((t) => t.function.name)).toContain("etat_simuler_politique");
  });
});
