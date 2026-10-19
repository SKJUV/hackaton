// Exécuté avant `next build` uniquement sur Vercel : copie les PDF officiels dans
// public/sources/ pour qu'ils soient servis en statique (le bundle serverless ne peut pas les contenir).
import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";

if (!process.env.VERCEL) {
  console.log("prepare-vercel: hors Vercel, rien à faire.");
  process.exit(0);
}
const root = process.cwd();
const target = path.join(root, "public", "sources");
await mkdir(target, { recursive: true });
for (const folder of ["reglementation", "publications", "corpus/officiel"]) {
  try {
    await stat(path.join(root, folder));
  } catch {
    continue;
  }
  await cp(path.join(root, folder), path.join(target, folder), {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}.`) && (path.extname(src) === "" || src.toLowerCase().endsWith(".pdf")),
  });
}
console.log("prepare-vercel: PDF copiés dans public/sources/.");
