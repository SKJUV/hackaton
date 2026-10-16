import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { __clearCache } from "@/lib/workspace/store";

/** Base isolée par fichier de test ; jamais d'envoi réel. */
export function useTempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "ws-test-"));
  process.env.WORKSPACE_DB_PATH = path.join(dir, "db.json");
  process.env.MAIL_MODE = "simulation";
  delete process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  __clearCache();
}
