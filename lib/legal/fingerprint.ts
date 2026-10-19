import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Empreinte du corpus officiel, fichier par fichier : sha256 du texte indexé de chaque source.
 * Relue depuis le disque (avec cache sur la date de modification) : après une ré-ingestion
 * (`npm run index-documents` / `npm run ingest`), les fichiers modifiés, ajoutés ou retirés sont détectés.
 */
type Chunk = { source: string; page?: number; text: string };

const FILES = () => [
  process.env.DOCUMENT_INDEX_PATH || path.join(process.cwd(), "data", "documents.json"),
  path.join(process.cwd(), "data", "corpus-officiel.json"),
];

let cache: { key: string; hashes: Record<string, string> } | null = null;

async function readChunks(file: string): Promise<{ mtime: number; chunks: Chunk[] }> {
  try {
    const st = await stat(file);
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    return { mtime: st.mtimeMs, chunks: Array.isArray(parsed) ? (parsed as Chunk[]) : [] };
  } catch {
    return { mtime: 0, chunks: [] };
  }
}

export async function corpusFingerprint(): Promise<Record<string, string>> {
  const stats = await Promise.all(FILES().map((f) => stat(f).then((s) => `${f}:${s.mtimeMs}:${s.size}`).catch(() => `${f}:absent`)));
  const key = stats.join("|");
  if (cache?.key === key) return cache.hashes;
  const parts = await Promise.all(FILES().map(readChunks));
  const bySource = new Map<string, ReturnType<typeof createHash>>();
  for (const { chunks } of parts) {
    for (const c of chunks) {
      if (!c?.source) continue;
      let h = bySource.get(c.source);
      if (!h) bySource.set(c.source, (h = createHash("sha256")));
      h.update(`${c.page ?? ""}\u0000${c.text ?? ""}\u0001`);
    }
  }
  const hashes = Object.fromEntries([...bySource].map(([source, h]) => [source, h.digest("hex").slice(0, 32)]));
  cache = { key, hashes };
  return hashes;
}

/** Empreintes des fichiers demandés (absent = fichier inconnu du corpus). */
export async function hashesFor(files: string[]): Promise<Record<string, string>> {
  const all = await corpusFingerprint();
  return Object.fromEntries([...new Set(files)].filter((f) => all[f]).map((f) => [f, all[f]]));
}

/** Réservé aux tests. */
export function __resetFingerprintCache() {
  cache = null;
}
