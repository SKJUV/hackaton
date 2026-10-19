import { readData } from "@/lib/workspace/store";
import { LEVEL_LABEL, computeScore } from "./score";
import { ensureMemoireSeed } from "./seed";
import { readMemo } from "./store";

/**
 * Mode bas débit et vocal : réponses courtes, sans tableaux ni Markdown lourd, faciles à lire à voix haute.
 */
export const LITE_MAX_CHARS = 420;

/** Texte brut lisible à voix haute (marqueurs de citation conservés à part). */
export function toPlain(md: string): string {
  return md
    .replace(/^\|.*\|$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Raccourcit une réponse en gardant des phrases entières et les références [Sx] présentes dans l'extrait. */
export function shortenAnswer(answer: string, max = LITE_MAX_CHARS): { text: string; truncated: boolean } {
  const plain = toPlain(answer);
  if (plain.length <= max) return { text: plain, truncated: false };
  // Coupe aux fins de phrase suivies d'une majuscule (évite « p. 127 », « art. 34 »).
  const sentences = plain.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ý•«])|\n/);
  let out = "";
  for (const s of sentences) {
    if (!s.trim()) continue;
    if ((out + " " + s).trim().length > max) break;
    out = `${out} ${s}`.trim();
  }
  if (!out) out = `${plain.slice(0, max - 1).trimEnd()}…`;
  return { text: out, truncated: true };
}

/**
 * Version bas débit d'une réponse de l'agent : le fondement juridique est renvoyé à part (champ `basis`),
 * on retire donc le paragraphe « Base juridique : … » de tête quand il reste autre chose à dire.
 */
export function liteAnswer(answer: string, max = LITE_MAX_CHARS) {
  const paragraphs = answer.split(/\n{2,}/);
  const body = /^\s*(\*\*)?Base juridique/i.test(paragraphs[0] ?? "") && paragraphs.length > 1 ? paragraphs.slice(1).join("\n\n") : answer;
  return shortenAnswer(body, max);
}

/** Phrase courte pour la lecture vocale (≤ 3 phrases) : situation de l'entreprise. */
export async function liteBriefing(companyId: string): Promise<string> {
  await ensureMemoireSeed(companyId);
  const data = await readData();
  const company = data.companies.find((c) => c.id === companyId);
  if (!company) return "Entreprise introuvable.";
  const open = data.tasks.filter((t) => t.companyId === companyId && t.status !== "fait");
  const late = open.filter((t) => t.dueDate && Date.parse(t.dueDate) < Date.now());
  const pending = data.approvals.filter((a) => a.companyId === companyId && a.status === "en_attente").length;
  const last = readMemo(data).decisions.filter((d) => d.companyId === companyId).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];
  const score = computeScore(data, companyId);
  return [
    `${company.name.replace(" (démo)", "")} : ${open.length} tâche${open.length > 1 ? "s" : ""} ouverte${open.length > 1 ? "s" : ""}, dont ${late.length} en retard, et ${pending} approbation${pending > 1 ? "s" : ""} en attente.`,
    last ? `Dernière décision : ${last.title}.` : "Aucune décision enregistrée.",
    `Score Co-founder : ${score.score} sur 100, niveau ${LEVEL_LABEL[score.level].toLowerCase()}.`,
  ].join(" ");
}
