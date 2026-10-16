"use client";

export type Me = {
  user: { id: string; email: string; name: string; kind: "standard" | "invite" | "demo"; hasPassword: boolean } | null;
  subscription: { id: string; planId: string; status: string; simulated: boolean; provider: string; currentPeriodEnd?: string; reference: string; plan?: { name: string } } | null;
  history: { id: string; planId: string; status: string; provider: string; simulated: boolean; amount: number; createdAt: string; reference: string }[];
  assistantAccess: boolean;
  paywall: boolean;
  mailMode: "simulation" | "live";
  devSecret: boolean;
};

export async function post<T = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erreur ${res.status}`);
  return data as T;
}

export async function getMe(): Promise<Me> {
  return (await fetch("/api/auth/me", { cache: "no-store" })).json();
}

export function nextParam(fallback = "/workspace"): string {
  if (typeof window === "undefined") return fallback;
  const n = new URLSearchParams(window.location.search).get("next") ?? "";
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

export function queryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}
