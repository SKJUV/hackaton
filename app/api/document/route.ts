import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const allowedRoots = ["reglementation", "publications", "corpus/officiel"].map((folder) =>
  path.resolve(process.cwd(), folder),
);

export async function GET(request: Request) {
  const relativeFile = new URL(request.url).searchParams.get("file");
  if (!relativeFile || path.isAbsolute(relativeFile)) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 400 });
  }

  const resolved = path.resolve(process.cwd(), relativeFile);
  const allowed = allowedRoots.some(
    (root) => resolved.startsWith(`${root}${path.sep}`),
  );
  if (!allowed || path.extname(resolved).toLocaleLowerCase() !== ".pdf") {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  try {
    const verifiedPath = await realpath(resolved);
    if (!allowedRoots.some((root) => verifiedPath.startsWith(`${root}${path.sep}`))) {
      return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
    }
    const pdf = await readFile(verifiedPath);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Ce document n’est plus disponible." }, { status: 404 });
    }
    console.error("Could not open source document:", error);
    return NextResponse.json({ error: "Impossible d’ouvrir ce document." }, { status: 500 });
  }
}
