import { describe, expect, it } from "vitest";
import { checkReferences, checkReferencesWith } from "@/lib/legal/reference-check";
import { ALL_TOOLS } from "@/lib/agent/registry";
import { nullableOptionals, stripNulls } from "@/lib/agent/runner";

describe("post-contrôle des références de textes", () => {
  it("retire une référence à gabarit inventée (« Décret n° 2015/XXX »)", async () => {
    const r = await checkReferences("Non couvert. Voir le Décret n° 2015/XXX relatif à la TVA.", []);
    expect(r.text).not.toContain("2015/XXX");
    expect(r.text).toContain("[référence non vérifiée retirée]");
    expect(r.removed).toHaveLength(1);
  });

  it("garde une loi présente dans le corpus (loi n° 2010/013 sur les communications électroniques)", async () => {
    const r = await checkReferences("Selon la loi n° 2010/013 du 21 décembre 2010 [S1].", []);
    expect(r.unverified).toEqual([]);
    expect(r.text).toBe("Selon la loi n° 2010/013 du 21 décembre 2010 [S1].");
  });

  it("signale une référence numérotée absente du corpus et des extraits", async () => {
    const r = await checkReferences("Le décret n° 2019/987 fixe le taux de l'impôt.", []);
    expect(r.unverified).toEqual(["décret n° 2019/987"]);
    expect(r.text).toContain("(⚠️ référence non vérifiée)");
    expect(r.text).toMatch(/absente\(s\) du corpus officiel/);
  });

  it("détecte une référence écrite avec un trait d'union insécable (U+2011) et des espaces fines", async () => {
    const r = await checkReferences("Code du travail (décret n°\u202f92\u2011020 du 23 janvier 1992).", []);
    expect(r.unverified).toEqual(["décret n°\u202f92\u2011020"]);
    expect(r.text).toContain("(⚠️ référence non vérifiée)");
  });

  it("accepte une référence présente dans un extrait cité", () => {
    const r = checkReferencesWith("L'arrêté n° 0012/MINPOSTEL s'applique.", new Set(), ["… l'arrêté n°0012/MINPOSTEL du 3 mars … "]);
    expect(r.unverified).toEqual([]);
  });

  it("variantes : ordonnance, loi-cadre, années à deux chiffres", () => {
    const known = new Set(["98/13", "1998/13"]);
    expect(checkReferencesWith("la loi n° 98/013 sur la concurrence", known).unverified).toEqual([]);
    expect(checkReferencesWith("l'ordonnance n° 2020-12", known).unverified).toHaveLength(1);
    expect(checkReferencesWith("la loi-cadre n° 2011/012", known).unverified).toHaveLength(1);
    expect(checkReferencesWith("texte sans numéro : la loi de finances", known).text).toBe("texte sans numéro : la loi de finances");
  });
});

describe("outils : champs optionnels null acceptés (validation stricte Groq/gpt-oss)", () => {
  it("tous les champs optionnels de tous les modules acceptent null", () => {
    const bad: string[] = [];
    const visit = (schema: Record<string, unknown>, where: string) => {
      const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      const req = new Set((schema.required as string[]) ?? []);
      for (const [k, p] of Object.entries(props)) {
        const ok = req.has(k) || (Array.isArray(p.type) && p.type.includes("null")) || (Array.isArray(p.anyOf) && p.anyOf.some((x: { type?: string }) => x.type === "null"));
        if (!ok) bad.push(`${where}.${k}`);
        if (p.properties) visit(p, `${where}.${k}`);
      }
    };
    for (const t of ALL_TOOLS) visit(nullableOptionals(t.parameters) as Record<string, unknown>, t.name);
    expect(bad).toEqual([]);
    expect(ALL_TOOLS.some((t) => t.name.startsWith("fund_"))).toBe(true);
    expect(ALL_TOOLS.some((t) => t.name.startsWith("etat_"))).toBe(true);
  });

  it("les null sont retirés avant exécution, récursivement", () => {
    expect(stripNulls({ a: null, b: 1, c: { d: null, e: [1, null, { f: null }] } })).toEqual({ b: 1, c: { e: [1, {}] } });
  });
});

import { afterEach, vi } from "vitest";
import { runAgent } from "@/lib/agent/runner";
import { readData } from "@/lib/workspace/store";
import { useTempDb } from "./setup-db";

describe("agent (fournisseur simulé) : la référence inventée n'atteint pas l'utilisateur", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
  });
  it("une réponse LLM « non couvert » avec un décret inventé est assainie côté serveur", async () => {
    useTempDb();
    process.env.GROQ_API_KEY = "cle-de-test-fictive";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Base juridique : non couvert par le corpus officiel. Le taux est fixé par le Décret n° 2015/XXX et le décret n° 2019/987." } }] }), { status: 200, headers: { "content-type": "application/json" } })));
    const company = (await readData()).companies[0];
    const reply = await runAgent(company, [{ role: "user", content: "Quel est le taux de TVA ?" }]);
    expect(reply.mode).toBe("llm");
    expect(reply.answer).not.toContain("2015/XXX");
    expect(reply.answer).toContain("décret n° 2019/987 (⚠️ référence non vérifiée)");
  });
});
