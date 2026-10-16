import { NextResponse } from "next/server";
import { WorkspaceError } from "./service";

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    throw new WorkspaceError("Le format de la requête est invalide.");
  }
}

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (error) {
    if (error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }
}

export const s = (v: unknown) => (typeof v === "string" ? v : "");
