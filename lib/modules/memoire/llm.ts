/**
 * Appel texte simple (sans outils) aux mêmes fournisseurs que l'agent (Groq / OpenAI-compatible / Gemini).
 * Renvoie null si aucune clé n'est configurée ou si tous les fournisseurs échouent : l'appelant bascule alors
 * sur son mode démo déterministe. Aucun secret n'est jamais renvoyé.
 */
export async function completeText(system: string, user: string, maxTokens = 1500): Promise<{ text: string; provider: string } | null> {
  // Import dynamique : évite un cycle runner → tools → module mémoire → runner à l'évaluation.
  const { resolveProviders } = await import("@/lib/agent/runner");
  for (const p of resolveProviders()) {
    try {
      if (p.kind === "openai") {
        const res = await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
          body: JSON.stringify({ model: p.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.1, max_tokens: maxTokens }),
          signal: AbortSignal.timeout(45000),
        });
        if (!res.ok) continue;
        const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
        const text = body.choices?.[0]?.message?.content?.trim();
        if (text) return { text, provider: `${p.name} · ${p.model}` };
      } else {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": p.key },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens } }),
          signal: AbortSignal.timeout(45000),
        });
        if (!res.ok) continue;
        const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = body.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("").trim();
        if (text) return { text, provider: `${p.name} · ${p.model}` };
      }
    } catch {
      /* fournisseur suivant */
    }
  }
  return null;
}

/** Extrait le premier objet JSON d'une réponse de modèle (tolère les blocs ```json). */
export function parseJsonObject<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
