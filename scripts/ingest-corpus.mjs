#!/usr/bin/env node
/**
 * Ingestion du corpus officiel texte/JSON (corpus/officiel) → data/corpus-officiel.json.
 * Les PDF du même dossier sont indexés par `npm run index-documents`.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputDir = path.join(root, "corpus", "officiel");
const outputPath = path.join(root, "data", "corpus-officiel.json");

async function walk(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])),
  );
  return files.flat();
}

export function parseFrontMatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

/** Découpe par article quand c'est possible, sinon par paragraphes (~1400 caractères). */
export function splitArticles(body) {
  const parts = body.split(/\n(?=\s*(?:ARTICLE|Article)\s+(?:premier|\d{1,3}))/);
  if (parts.length > 1) return parts.map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of body.split(/\n{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)) {
    if ((current + " " + paragraph).length > 1400 && current) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current} ${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function main() {
  const files = (await walk(inputDir)).filter((f) => /\.(md|txt|json)$/i.test(f) && path.basename(f) !== "README.md");
  const chunks = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const raw = await readFile(file, "utf8");
    if (file.toLowerCase().endsWith(".json")) {
      const docs = JSON.parse(raw);
      for (const [d, doc] of (Array.isArray(docs) ? docs : [docs]).entries()) {
        for (const [a, article] of (doc.articles ?? []).entries()) {
          chunks.push({ id: `${rel}#${d}-${a}`, source: rel, title: doc.titre, category: doc.categorie || "Corpus officiel", page: a + 1, text: `Article ${article.numero} — ${article.texte}`, officialSource: doc.source_officielle || null });
        }
      }
      continue;
    }
    const { meta, body } = parseFrontMatter(raw);
    splitArticles(body).forEach((text, index) => {
      chunks.push({ id: `${rel}#${index}`, source: rel, title: meta.titre || path.basename(file, path.extname(file)), category: meta.categorie || "Corpus officiel", page: index + 1, text, officialSource: meta.source_officielle || null });
    });
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(chunks, null, 2));
  console.log(`${files.length} fichier(s) → ${chunks.length} extrait(s) écrits dans data/corpus-officiel.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
