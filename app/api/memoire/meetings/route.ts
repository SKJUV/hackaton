import { assertCompanyAccess } from "@/lib/workspace/access";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { createMeeting, listMeetings, recordMeeting } from "@/lib/modules/memoire/meetings";
import { actorName } from "@/lib/modules/memoire/overview";
import type { Meeting } from "@/lib/modules/memoire/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    await assertCompanyAccess(companyId, viewer);
    return listMeetings(companyId);
  });
}

/** Ouvre une réunion (en direct) ou, avec `finalize`, l'enregistre et l'analyse immédiatement. */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const source = (["texte", "audio", "dictee"].includes(s(b.source)) ? s(b.source) : "texte") as Meeting["source"];
    const t = b.transcription as { provider?: unknown; demo?: unknown } | undefined;
    const input = {
      title: s(b.title),
      transcript: s(b.transcript),
      participants: Array.isArray(b.participants) ? b.participants.map(s) : s(b.participants).split(","),
      date: s(b.date) || undefined,
      source,
      transcription: t && typeof t === "object" ? { provider: s(t.provider).slice(0, 80), demo: Boolean(t.demo) } : undefined,
    };
    const actor = await actorName(companyId, s(b.memberId));
    if (b.finalize === true) return recordMeeting(companyId, input, actor);
    return { meeting: await createMeeting(companyId, input, actor) };
  });
}
