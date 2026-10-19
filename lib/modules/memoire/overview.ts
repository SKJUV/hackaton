import { readData } from "@/lib/workspace/store";
import { listAttestations, publicKeyInfo } from "./attestations";
import { computeScore, METHODOLOGY } from "./score";
import { ensureMemoireSeed } from "./seed";
import { readMemo } from "./store";
import { transcriptionEndpoints } from "./transcribe";

/** Nom du membre (pour « décidé par ») ; « utilisateur » si inconnu. */
export async function actorName(companyId: string, memberId?: string): Promise<string> {
  if (!memberId) return "utilisateur";
  const data = await readData();
  return data.members.find((m) => m.id === memberId && m.companyId === companyId)?.name ?? "utilisateur";
}

/** Vue d'ensemble du module pour l'UI du workspace (aucun secret). */
export async function memoireOverview(companyId: string) {
  await ensureMemoireSeed(companyId);
  const data = await readData();
  const m = readMemo(data);
  const key = publicKeyInfo();
  const { resolveProviders } = await import("@/lib/agent/runner");
  return {
    decisions: m.decisions.filter((d) => d.companyId === companyId).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
    meetings: m.meetings.filter((x) => x.companyId === companyId).sort((a, b) => b.date.localeCompare(a.date)),
    attestations: (await listAttestations(companyId)).map((a) => ({ id: a.id, score: a.payload.score, level: a.payload.level, issuedAt: a.payload.issuedAt, expiresAt: a.payload.expiresAt, revokedAt: a.revokedAt, demo: a.payload.demo })),
    score: computeScore(data, companyId),
    methodology: METHODOLOGY,
    signing: { algorithm: key.algorithm, keyId: key.keyId, source: key.source },
    transcription: { providers: transcriptionEndpoints().map((e) => e.name), demo: transcriptionEndpoints().length === 0 },
    ai: { providers: resolveProviders().map((p) => p.name), demo: resolveProviders().length === 0 },
  };
}

export type MemoireOverview = Awaited<ReturnType<typeof memoireOverview>>;
