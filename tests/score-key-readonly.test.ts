import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSigningKey, signPayload, verifyPayload } from "@/lib/modules/memoire/signing";

describe("score : clé de signature de démo sur système de fichiers en lecture seule (Vercel)", () => {
  afterEach(() => { delete process.env.COFOUNDER_SCORE_KEY_FILE; });
  it("chemin non inscriptible → repli /tmp ou mémoire, clé toujours marquée démo et utilisable", () => {
    // Le « dossier » parent est un fichier : toute écriture échoue (ENOTDIR), comme sur un FS en lecture seule.
    const blocker = path.join(mkdtempSync(path.join(os.tmpdir(), "ro-")), "fichier");
    writeFileSync(blocker, "x");
    process.env.COFOUNDER_SCORE_KEY_FILE = path.join(blocker, "sous-dossier", "score.pem");
    const key = getSigningKey();
    expect(key.source).toBe("dev");
    expect(["tmp", "memoire"]).toContain(key.storage);
    const sig = signPayload({ score: 42 }, key);
    expect(verifyPayload({ score: 42 }, sig, key.publicKeyPem)).toBe(true);
  });
});
