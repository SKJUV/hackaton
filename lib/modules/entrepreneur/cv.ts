import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceError } from "@/lib/workspace/service";

/**
 * Extraction du texte d'un CV PDF avec `pdftotext` (poppler-utils, déjà requis par l'indexation du corpus).
 * Sans poppler (Vercel, serverless), repli en JavaScript pur avec `unpdf` (pdf.js packagé pour le serverless).
 * `unpdf` est épinglé en 0.12.1 : les versions 1.x exigent Node 22 (global `Iterator`), or le runtime actuel est Node 20.
 * Si les deux échouent (scan, PDF chiffré), on demande de coller le texte : la fonctionnalité reste disponible.
 */
export const MAX_CV_BYTES = 5 * 1024 * 1024;

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_CV_BYTES) throw new WorkspaceError("CV trop volumineux (5 Mo maximum).", 413);
  if (Buffer.from(bytes.slice(0, 5)).toString("latin1") !== "%PDF-") throw new WorkspaceError("Le fichier n'est pas un PDF.");
  const dir = await mkdtemp(path.join(tmpdir(), "cv-"));
  const file = path.join(dir, "cv.pdf");
  try {
    let text: string;
    try {
      if (process.env.CV_PDF_EXTRACTOR === "js") throw Object.assign(new Error("js forcé"), { code: "ENOENT" });
      await writeFile(file, bytes);
      text = await new Promise<string>((resolve, reject) => {
        execFile("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      text = await extractWithJs(bytes);
    }
    const clean = text.replace(/\f/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (clean.length < 20) throw new WorkspaceError("Aucun texte lisible dans ce PDF (scan ?) : collez le texte du CV.", 422);
    return clean.slice(0, 20000);
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new WorkspaceError("Extraction PDF indisponible sur ce serveur : collez le texte du CV.", 501);
    throw new WorkspaceError("Lecture du PDF impossible : collez le texte du CV.", 422);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Repli JavaScript (sans binaire système) : fonctionne sur Vercel et tout hébergement serverless. */
export async function extractWithJs(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  } catch {
    throw new WorkspaceError("Lecture du PDF impossible : collez le texte du CV.", 422);
  }
}
