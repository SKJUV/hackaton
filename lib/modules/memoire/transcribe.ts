import { SEED_TRANSCRIPT } from "./seed";

/**
 * Transcription audio d'une réunion.
 * - Groq Whisper (GROQ_API_KEY) — modèle GROQ_TRANSCRIBE_MODEL (défaut whisper-large-v3-turbo) ;
 * - OpenAI-compatible (OPENAI_API_KEY + OPENAI_BASE_URL) — modèle OPENAI_TRANSCRIBE_MODEL (défaut whisper-1) ;
 * - sinon : transcription de DÉMONSTRATION clairement marquée (aucun envoi du fichier).
 * TRANSCRIPTION_PROVIDER = auto | groq | openai | demo.
 * Dans le navigateur, la dictée en direct réutilise la reconnaissance vocale existante (VoiceInputButton).
 */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type Transcription = { text: string; provider: string; demo: boolean; notice?: string };

type Endpoint = { name: string; url: string; key: string; model: string };

export function transcriptionEndpoints(): Endpoint[] {
  const pref = (process.env.TRANSCRIPTION_PROVIDER || "auto").toLowerCase();
  if (pref === "demo") return [];
  const list: Endpoint[] = [];
  const add = (p: string) => {
    if (p === "groq" && process.env.GROQ_API_KEY)
      list.push({ name: "Groq Whisper", url: "https://api.groq.com/openai/v1/audio/transcriptions", key: process.env.GROQ_API_KEY, model: process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3-turbo" });
    if (p === "openai" && process.env.OPENAI_API_KEY)
      list.push({ name: "OpenAI Whisper", url: `${(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/audio/transcriptions`, key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1" });
  };
  if (pref === "auto") ["groq", "openai"].forEach(add);
  else add(pref);
  return list;
}

export async function transcribeAudio(file: Blob, filename = "reunion.webm"): Promise<Transcription> {
  if (file.size > MAX_AUDIO_BYTES) throw new Error("Fichier audio trop volumineux (25 Mo max).");
  const errors: string[] = [];
  for (const ep of transcriptionEndpoints()) {
    try {
      const form = new FormData();
      form.append("file", file, filename);
      form.append("model", ep.model);
      form.append("language", "fr");
      form.append("response_format", "json");
      const res = await fetch(ep.url, { method: "POST", headers: { Authorization: `Bearer ${ep.key}` }, body: form, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) {
        errors.push(`${ep.name} HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { text?: string };
      if (body.text?.trim()) return { text: body.text.trim(), provider: `${ep.name} · ${ep.model}`, demo: false };
      errors.push(`${ep.name} : transcription vide`);
    } catch (e) {
      errors.push(`${ep.name} : ${e instanceof Error ? e.message : "erreur"}`);
    }
  }
  return {
    text: SEED_TRANSCRIPT,
    provider: "démo",
    demo: true,
    notice: errors.length
      ? `Transcription indisponible (${errors.join(" ; ")}) : texte de DÉMONSTRATION affiché, à remplacer.`
      : "Mode démo : aucune clé de transcription (GROQ_API_KEY ou OPENAI_API_KEY). Le texte affiché est un EXEMPLE, pas votre enregistrement.",
  };
}
