import { createTask } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePaid(async () => {
    const b = await readJson(request);
    const due = s(b.dueDate);
    return createTask(s(b.companyId), { title: s(b.title), description: s(b.description) || undefined, dueDate: due ? new Date(due).toISOString() : undefined });
  });
}
