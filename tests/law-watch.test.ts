import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { __resetFingerprintCache, corpusFingerprint } from "@/lib/legal/fingerprint";
import { groundQuery } from "@/lib/legal/grounding";
import { ignoreLawChange, scanLawChanges, simulateLawChange, updateDocumentLegalBasis } from "@/lib/modules/law-watch/service";
import { TOOL_MAP } from "@/lib/agent/registry";
import { saveDocument } from "@/lib/workspace/service";
import { readData } from "@/lib/workspace/store";

let tmpIndex = "";
beforeAll(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lawwatch-"));
  tmpIndex = path.join(dir, "documents.json");
  await copyFile(path.join(process.cwd(), "data", "documents.json"), tmpIndex);
  process.env.DOCUMENT_INDEX_PATH = tmpIndex;
  __resetFingerprintCache();
});
afterAll(() => {
  delete process.env.DOCUMENT_INDEX_PATH;
  __resetFingerprintCache();
});

async function groundedDoc() {
  const g = await groundQuery("licence opérateur de communications électroniques", 3);
  expect(g.sources.filter((s) => !s.isExample).length).toBeGreaterThan(0);
  return saveDocument("co_kmerlog", { title: "Note licence (test)", kind: "contrat", content: "# Note\n\ntexte", legalQuery: g.query, legalSources: g.sources });
}

describe("alerte de changement de loi", () => {
  beforeEach(useTempDb);

  it("le document mémorise l'empreinte de ses textes sources", async () => {
    const doc = await groundedDoc();
    const fp = await corpusFingerprint();
    expect(Object.keys(doc.corpusHashes ?? {}).length).toBeGreaterThan(0);
    for (const [f, h] of Object.entries(doc.corpusHashes!)) expect(fp[f]).toBe(h);
    expect((await scanLawChanges("co_kmerlog")).impacts).toHaveLength(0);
  });

  it("détecte une vraie modification du corpus ré-ingéré puis met à jour le fondement", async () => {
    const doc = await groundedDoc();
    const file = Object.keys(doc.corpusHashes!)[0];
    const chunks = JSON.parse(await readFile(tmpIndex, "utf8")) as { source: string; text: string }[];
    const target = chunks.find((c) => c.source === file)!;
    target.text += " [modification de test]";
    await writeFile(tmpIndex, JSON.stringify(chunks));
    __resetFingerprintCache();

    const scan = await scanLawChanges("co_kmerlog");
    expect(scan.impacts.map((i) => i.documentId)).toContain(doc.id);
    expect(scan.impacts[0].simulated).toBe(false);
    const stored = (await readData()).documents.find((d) => d.id === doc.id)!;
    expect(stored.lawChange?.status).toBe("a_revoir");

    const updated = await updateDocumentLegalBasis("co_kmerlog", doc.id);
    expect(updated.lawChange?.status).toBe("mis_a_jour");
    expect(updated.content).toContain("Fondement mis à jour");
    expect((await scanLawChanges("co_kmerlog")).impacts).toHaveLength(0);
    expect((await readData()).activity.some((a) => a.action === "loi.changement")).toBe(true);
  });

  it("simulation démo, outil agent et alerte ignorée", async () => {
    const doc = await groundedDoc();
    await simulateLawChange("co_kmerlog");
    const r = await TOOL_MAP.get("loi_verifier_changements")!.run({}, { companyId: "co_kmerlog" } as never);
    const impacts = (r.data as { impacts: { documentId: string; simulated: boolean }[] }).impacts;
    expect(impacts.find((i) => i.documentId === doc.id)?.simulated).toBe(true);
    await ignoreLawChange("co_kmerlog", doc.id);
    expect((await scanLawChanges("co_kmerlog")).impacts.find((i) => i.documentId === doc.id)).toBeUndefined();
  });

  it("refuse la simulation sans document ancré", async () => {
    await expect(simulateLawChange("co_inexistante")).rejects.toThrow();
  });
});
