import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "./setup-db";
import { runAgent } from "@/lib/agent/runner";
import { getSnapshot } from "@/lib/workspace/service";

/** Vérifie la boucle function-calling avec des réponses LLM simulées (aucun appel réseau). */
describe("boucle LLM (fetch simulé)", () => {
  beforeEach(useTempDb);
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.LLM_PROVIDER;
  });

  it("Groq/OpenAI : exécute l'outil demandé puis renvoie la réponse finale", async () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "groq";
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "creer_tache", arguments: JSON.stringify({ titre: "Appeler la banque" }) } }] } }] },
      { choices: [{ message: { content: "C'est noté, tâche créée." } }] },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Rappelle-moi d'appeler la banque" }]);
    expect(reply.mode).toBe("llm");
    expect(reply.answer).toContain("tâche créée");
    expect(reply.toolTrace[0]).toMatchObject({ tool: "creer_tache", ok: true });
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.messages.at(-1).role).toBe("tool");
    expect((await getSnapshot("co_kmerlog")).tasks.some((t) => t.title === "Appeler la banque")).toBe(true);
  });

  it("Gemini : functionCall → functionResponse → texte", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "gemini";
    const replies = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "score_conformite", args: {} } }] } }] },
      { candidates: [{ content: { role: "model", parts: [{ text: "Votre score est de 41/100." }] } }] },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Mon score ?" }]);
    expect(reply.answer).toContain("41/100");
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.contents.at(-1).parts[0].functionResponse.name).toBe("score_conformite");
  });

  it("bascule en mode démo si le fournisseur IA échoue avant toute action", async () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "groq";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const { company } = await getSnapshot("co_kmerlog");
    const reply = await runAgent(company, [{ role: "user", content: "Quel est mon score de conformité ?" }]);
    expect(reply.mode).toBe("demo");
    expect(reply.notice).toMatch(/bascule en mode démo/);
  });
});
