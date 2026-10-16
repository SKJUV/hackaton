import { runAgent, type AgentTurn } from "@/lib/agent/runner";
import { newId, nowIso, readData, withData } from "@/lib/workspace/store";
import { log, WorkspaceError } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Agent co-fondateur : function-calling sur les outils du workspace. */
export async function POST(request: Request) {
  return handlePaid(async () => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    const message = s(b.message).trim();
    if (message.length < 2 || message.length > 4000) throw new WorkspaceError("Message entre 2 et 4 000 caractères.");
    const data = await readData();
    const company = data.companies.find((c) => c.id === companyId);
    if (!company) throw new WorkspaceError("Entreprise introuvable.", 404);

    const history: AgentTurn[] = [
      ...data.messages.filter((m) => m.companyId === companyId).slice(-10).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];
    await withData((d) => {
      d.messages.push({ id: newId("msg"), companyId, role: "user", content: message, createdAt: nowIso() });
    });

    const reply = await runAgent(company, history);
    await withData((d) => {
      d.messages.push({ id: newId("msg"), companyId, role: "assistant", content: reply.answer, toolTrace: reply.toolTrace, mode: reply.mode, createdAt: nowIso() });
      if (reply.toolTrace.length) log(d, companyId, "agent", "agent.actions", `${reply.toolTrace.length} outil(s) : ${reply.toolTrace.map((t) => t.tool).join(", ")}.`);
    });
    return reply;
  });
}

export async function DELETE(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId") ?? "";
  return handlePaid(async () => {
    await withData((d) => {
      d.messages = d.messages.filter((m) => m.companyId !== companyId);
    });
    return { ok: true };
  });
}
