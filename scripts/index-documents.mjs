import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScheduler, createWorker } from "tesseract.js";

const require = createRequire(import.meta.url);
const frenchOcrData = require("@tesseract.js-data/fra");
const englishOcrData = require("@tesseract.js-data/eng");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFolders = ["reglementation", "publications"];
const outputDirectory = path.join(projectRoot, "data");
const outputPath = path.join(outputDirectory, "documents.json");
const includeScannedPageOCR = process.argv.includes("--ocr");
const maximumCharactersPerChunk = 1400;
const overlapCharacters = 180;

function run(command, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let size = 0;

    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBuffer) {
        child.kill();
        reject(new Error(`${command} output exceeded ${maxBuffer} bytes.`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(`${command} exited with code ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
  });
}

async function listPdfs(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) return listPdfs(fullPath);
      return entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")
        ? [fullPath]
        : [];
    }),
  );
  return nested.flat();
}

function normalizeText(text) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoChunks(text) {
  const paragraphs = normalizeText(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > maximumCharactersPerChunk) {
      if (current) chunks.push(current);
      current = "";
      for (let start = 0; start < paragraph.length; start += maximumCharactersPerChunk - overlapCharacters) {
        chunks.push(paragraph.slice(start, start + maximumCharactersPerChunk));
      }
      continue;
    }

    if (current.length + paragraph.length + 2 > maximumCharactersPerChunk) {
      if (current) chunks.push(current);
      current = current.slice(-overlapCharacters);
    }
    current = current ? `${current} ${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const folders = await Promise.all(
    sourceFolders.map(async (name) => {
      const fullPath = path.join(projectRoot, name);
      try {
        return { name, files: await listPdfs(fullPath) };
      } catch (error) {
        if (error.code === "ENOENT") return { name, files: [] };
        throw error;
      }
    }),
  );
  const pdfs = folders.flatMap(({ files }) => files.sort());

  if (pdfs.length === 0) {
    console.error("No PDFs found in reglementation/ or publications/.");
    process.exitCode = 1;
    return;
  }

  const ocrCacheDirectory = path.join(projectRoot, ".cache", "tesseract");
  if (!includeScannedPageOCR) {
    console.log("OCR is off. Run `npm run index-documents -- --ocr` to recognize scanned pages.");
  }

  const chunks = [];
  const hashes = new Map();
  let duplicateFiles = 0;
  let failedFiles = 0;
  let filesWithoutText = 0;
  let ocrScheduler;
  const ocrWorkers = [];

  for (let fileIndex = 0; fileIndex < pdfs.length; fileIndex += 1) {
    const absolutePath = pdfs[fileIndex];
    const relativePath = path.relative(projectRoot, absolutePath).split(path.sep).join("/");
    const sourceRoot = relativePath.split("/")[0];
    const category = relativePath.split("/").slice(1, -1).join(" / ") || sourceRoot;
    const title = path.basename(absolutePath, path.extname(absolutePath)).replace(/[-_]+/g, " ");

    try {
      const bytes = await readFile(absolutePath);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (hashes.has(digest)) {
        duplicateFiles += 1;
        console.log(`[${fileIndex + 1}/${pdfs.length}] duplicate skipped: ${relativePath}`);
        continue;
      }
      hashes.set(digest, relativePath);

      const rawText = await run("pdftotext", ["-layout", "-enc", "UTF-8", absolutePath, "-"]);
      const pages = rawText.split("\f");
      if (pages.at(-1)?.trim() === "") pages.pop();

      const firstChunkIndex = chunks.length;
      const pendingOcr = [];
      const pageTexts = new Array(pages.length);
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        pageTexts[pageIndex] = normalizeText(pages[pageIndex]);
        if (includeScannedPageOCR && pageTexts[pageIndex].replace(/\s/g, "").length < 35) {
          const imageBase = `${outputDirectory}/ocr-page-${process.pid}-${pageIndex}`;
          const imagePath = `${imageBase}.png`;
          try {
            if (!ocrScheduler) {
              const languageDirectory = path.join(ocrCacheDirectory, "tessdata");
              await mkdir(languageDirectory, { recursive: true });
              for (const language of [frenchOcrData, englishOcrData]) {
                await copyFile(
                  path.join(language.langPath, `${language.code}.traineddata.gz`),
                  path.join(languageDirectory, `${language.code}.traineddata.gz`),
                );
              }
              ocrScheduler = createScheduler();
              const workerCount = Math.min(4, availableParallelism());
              console.log(`Loading local OCR models (${workerCount} parallel workers)...`);
              for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
                const worker = await createWorker("fra+eng", undefined, {
                  cachePath: ocrCacheDirectory,
                  langPath: languageDirectory,
                  errorHandler: (error) =>
                    console.error("OCR worker error:", error),
                });
                ocrScheduler.addWorker(worker);
                ocrWorkers.push(worker);
              }
            }
            await run("pdftoppm", [
              "-f", String(pageIndex + 1), "-l", String(pageIndex + 1),
              "-scale-to", "1600", "-png", "-singlefile", absolutePath, imageBase,
            ]);
            const recognition = ocrScheduler.addJob("recognize", imagePath);
            pendingOcr.push(
              recognition
                .then((result) => {
                  pageTexts[pageIndex] = normalizeText(result.data.text);
                })
                .catch((error) => {
                  console.warn(
                    `OCR failed: ${relativePath} page ${pageIndex + 1}: ${error.message}`,
                  );
                })
                .finally(() => unlink(imagePath).catch(() => undefined)),
            );
            if (pendingOcr.length >= ocrWorkers.length * 2) {
              await pendingOcr.shift();
            }
          } catch (error) {
            console.warn(`OCR failed: ${relativePath} page ${pageIndex + 1}: ${error.message}`);
            await unlink(imagePath).catch(() => undefined);
          }
        }
      }

      await Promise.all(pendingOcr);
      for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex += 1) {
        for (const [chunkIndex, text] of splitIntoChunks(pageTexts[pageIndex]).entries()) {
          chunks.push({
            id: `${createHash("sha1").update(relativePath).digest("hex").slice(0, 10)}-${pageIndex + 1}-${chunkIndex + 1}`,
            source: relativePath,
            title,
            category,
            page: pageIndex + 1,
            text,
          });
        }
      }
      if (chunks.length === firstChunkIndex) {
        filesWithoutText += 1;
        console.warn(`No searchable text extracted: ${relativePath}`);
      }
      console.log(`[${fileIndex + 1}/${pdfs.length}] indexed ${relativePath}`);
    } catch (error) {
      failedFiles += 1;
      console.error(`Failed to index ${relativePath}: ${error.message}`);
    }
  }

  if (ocrScheduler) await ocrScheduler.terminate();
  await writeFile(outputPath, `${JSON.stringify(chunks)}\n`, "utf8");
  console.log(`\nIndexed ${chunks.length} passages from ${pdfs.length - duplicateFiles - failedFiles} PDFs.`);
  console.log(`${duplicateFiles} exact duplicate PDFs skipped; ${failedFiles} PDFs failed.`);
  console.log(`${filesWithoutText} PDFs contained no searchable text.`);
  console.log(`Index written to ${path.relative(projectRoot, outputPath)}.`);
}

await main();
