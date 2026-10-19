import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceError } from "@/lib/workspace/service";

/**
 * Extraction du texte d'un CV PDF avec `pdftotext` (poppler-utils, déjà requis par l'indexation du corpus).
 * Sur un hébergement sans poppler, on demande de coller le texte : la fonctionnalité reste disponible.
 */
export const MAX_CV_BYTES = 5 * 1024 * 1024;

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_CV_BYTES) throw new WorkspaceError("CV trop volumineux (5 Mo maximum).", 413);
  if (Buffer.from(bytes.slice(0, 5)).toString("latin1") !== "%PDF-") throw new WorkspaceError("Le fichier n'est pas un PDF.");
  const dir = await mkdtemp(path.join(tmpdir(), "cv-"));
  const file = path.join(dir, "cv.pdf");
  try {
    await writeFile(file, bytes);
    const text = await new Promise<string>((resolve, reject) => {
      execFile("pdftotext", ["-layout", "-enc", "UTF-8", file, "-"], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
    const clean = text.replace(/\f/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (clean.length < 20) throw new WorkspaceError("Aucun texte lisible dans ce PDF (scan ?) : collez le texte du CV.", 422);
    return clean.slice(0, 20000);
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new WorkspaceError("Extraction PDF indisponible sur ce serveur (pdftotext absent) : collez le texte du CV.", 501);
    throw new WorkspaceError("Lecture du PDF impossible : collez le texte du CV.", 422);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
