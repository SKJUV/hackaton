/**
 * Recherche web RÉELLE des concurrents via l'API officielle Brave Search
 * (https://api.search.brave.com, en-tête X-Subscription-Token). Sans clé `BRAVE_SEARCH_API_KEY`,
 * le module bascule en mode démo : aucun concurrent n'est inventé, seules des catégories génériques
 * marquées comme telles sont proposées.
 */
export type WebResult = { title: string; url: string; description: string };

export function webSearchConfigured() {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY);
}

export async function webSearch(query: string, count = 6, fetchImpl: typeof fetch = fetch): Promise<{ mode: "web" | "demo"; results: WebResult[]; error?: string }> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { mode: "demo", results: [] };
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&country=ALL&search_lang=fr`;
    const res = await fetchImpl(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { mode: "demo", results: [], error: `Brave Search HTTP ${res.status}` };
    const body = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
    const results = (body.web?.results ?? [])
      .filter((r) => r.url && r.title)
      .slice(0, count)
      .map((r) => ({ title: String(r.title).replace(/<[^>]+>/g, ""), url: String(r.url), description: String(r.description ?? "").replace(/<[^>]+>/g, "").slice(0, 300) }));
    return { mode: "web", results };
  } catch (error) {
    return { mode: "demo", results: [], error: error instanceof Error ? error.message : "erreur réseau" };
  }
}
