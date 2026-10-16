import { searchLegalCorpus } from "@/lib/legal/corpus";
import { WorkspaceError } from "@/lib/workspace/service";
import { handle } from "@/lib/workspace/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recherche directe dans le corpus (sans LLM) : extraits + citations. */
export async function GET(request: Request) {
  return handle(async () => {
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 3) throw new WorkspaceError("Requête trop courte.");
    return searchLegalCorpus(q, 8);
  });
}
