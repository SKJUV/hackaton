import { NextResponse } from "next/server";
import { assistantGuard } from "@/lib/auth/current";
import { canAccessCompany } from "@/lib/workspace/access";
import { readData } from "@/lib/workspace/store";
import { markdownToHtml } from "@/lib/modules/memoire/markdown";
import { getMeetingPv } from "@/lib/modules/memoire/meetings";
import { readMemo } from "@/lib/modules/memoire/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Export du PV : `format=md` (téléchargement Markdown) ou `format=html` (version imprimable → PDF). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, denied } = await assistantGuard();
  if (denied) return denied;
  const data = await readData();
  const meeting = readMemo(data).meetings.find((m) => m.id === id);
  if (!meeting || !canAccessCompany(data, meeting.companyId, user?.email ?? null)) return NextResponse.json({ error: "Réunion introuvable." }, { status: 404 });
  const { markdown, filename } = await getMeetingPv(id);
  const format = new URL(request.url).searchParams.get("format") ?? "md";
  if (format === "html") {
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${filename}</title><style>body{font:15px/1.55 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:.35rem .5rem;text-align:left}blockquote{margin:.1rem 0;padding-left:.6rem;border-left:3px solid #ddd;color:#444}@media print{.np{display:none}}</style></head><body><p class="np"><button onclick="print()">Imprimer / enregistrer en PDF</button></p>${markdownToHtml(markdown)}</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
  }
  return new Response(markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.md"` } });
}
