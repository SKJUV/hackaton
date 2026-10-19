import { NextResponse } from "next/server";
import { BillingError } from "@/lib/billing/service";
import { AuthError } from "./service";

export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = await request.json();
    return typeof b === "object" && b ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const str = (v: unknown) => (typeof v === "string" ? v : "");

export function fail(error: unknown) {
  if (error instanceof AuthError || error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
}

/** N'accepte que des redirections internes. */
export function safeNext(next: unknown, fallback = "/workspace"): string {
  const n = str(next);
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}
