import { assertCompanyAccess } from "@/lib/workspace/access";
import { log, visibleCompanies, WorkspaceError } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { newId, nowIso, readData, withData } from "@/lib/workspace/store";
import { runAgent, type AgentTurn } from "@/lib/agent/runner";
import { liteAnswer, liteBriefing } from "@/lib/modules/memoire/lite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Mode bas débit : liste minimale des entreprises + résumé vocal (quelques centaines d'octets). */
export async function GET(request: Request) {
  const wanted = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async (viewer) => {
    const companies = visibleCompanies(await readData(), viewer.email).map((c) => ({ id: c.id, name: c.name }));
    const companyId = companies.find((c) => c.id === wanted)?.id ?? companies[0]?.id;
    if (!companyId) throw new WorkspaceError("Aucune entreprise.", 404);
    return { companies, companyId, briefing: await liteBriefing(companyId) };
  });
}

/**
 * Question à l'agent en mode bas débit : même agent (mêmes outils, même ancrage juridique),
 * réponse raccourcie et sources compactes, sans trace d'outils détaillée.
 */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const message = s(b.message).trim();
    if (message.length < 2 || message.length > 2000) throw new WorkspaceError("Message entre 2 et 2 000 caractères.");
    const data = await readData();
    const company = data.companies.find((c) => c.id === companyId)!;
    const history: AgentTurn[] = [...data.messages.filter((m) => m.companyId === companyId).slice(-6).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }];
    await withData((d) => {
      d.messages.push({ id: newId("msg"), companyId, role: "user", content: message, createdAt: nowIso() });
    });
    const reply = await runAgent(company, history);
    await withData((d) => {
      d.messages.push({ id: newId("msg"), companyId, role: "assistant", content: reply.answer, toolTrace: reply.toolTrace, mode: reply.mode, grounding: reply.grounding, citations: reply.citations, createdAt: nowIso() });
      if (reply.toolTrace.length) log(d, companyId, "agent", "agent.actions", `[bas débit] ${reply.toolTrace.length} outil(s) : ${reply.toolTrace.map((t) => t.tool).join(", ")}.`);
    });
    const short = liteAnswer(reply.answer);
    return {
      text: short.text,
      truncated: short.truncated,
      basis: reply.grounding?.label ?? null,
      sources: reply.citations.filter((c) => !c.isExample).slice(0, 3).map((c) => ({ id: c.id, doc: (c.legalTitle ?? c.title).slice(0, 90), page: c.page, art: c.articles.slice(0, 3) })),
      tools: reply.toolTrace.map((t) => t.tool),
      mode: reply.mode,
    };
  });
}
