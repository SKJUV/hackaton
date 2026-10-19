import { NextResponse } from "next/server";
import { assistantGuard } from "@/lib/auth/current";
import { assertCompanyAccess } from "@/lib/workspace/access";
import { WorkspaceError } from "@/lib/workspace/service";
import { buildDataRoom, dataRoomIndex, dataRoomPdf, dataRoomZip } from "@/lib/modules/entreprise/dataroom";
import { dueDiligence, dueDiligenceMarkdown } from "@/lib/modules/entreprise/duediligence";
import { markdownToPdf } from "@/lib/modules/entreprise/pdf";
import { buildFinancialExport, type ExportTarget } from "@/lib/modules/entreprise/reports";
import { getState } from "@/lib/modules/entreprise/service";
import { writeZip } from "@/lib/modules/entreprise/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "export";

function file(data: Buffer | string, name: string, type: string) {
  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}

/** Téléchargements : rapports financiers (investisseurs, banque, fisc), rapport hebdomadaire, fiche de due diligence, data room (ZIP/PDF). */
export async function GET(request: Request) {
  const { user, denied } = await assistantGuard();
  if (denied) return denied;
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const format = url.searchParams.get("format") ?? "pdf";
  try {
    const company = await assertCompanyAccess(companyId, { user, email: user?.email ?? null });
    const base = slug(company.name);
    const day = new Date().toISOString().slice(0, 10);
    if (type === "dataroom") {
      const dr = await buildDataRoom(companyId);
      if (format === "zip") {
        const z = dataRoomZip(dr);
        return file(z.data, z.name, "application/zip");
      }
      if (format === "md") return file(dataRoomIndex(dr), `data-room-${base}.md`, "text/markdown; charset=utf-8");
      return file(dataRoomPdf(dr), `data-room-${base}.pdf`, "application/pdf");
    }
    if (type === "finance") {
      const cible = (url.searchParams.get("cible") ?? "investisseurs") as ExportTarget;
      if (!["investisseurs", "banque", "fisc"].includes(cible)) throw new WorkspaceError("Cible inconnue.");
      const b = await buildFinancialExport(companyId, cible);
      const name = `${cible}-${base}-${day}`;
      if (format === "md") return file(b.markdown, `${name}.md`, "text/markdown; charset=utf-8");
      if (format === "zip") return file(writeZip([{ name: `${name}/${name}.md`, data: b.markdown }, { name: `${name}/${name}.pdf`, data: markdownToPdf(b.markdown, `${b.title} — ${company.name}`) }, ...b.csv.map((c) => ({ name: `${name}/${c.name}`, data: c.content }))]), `${name}.zip`, "application/zip");
      if (format === "csv") return file(b.csv[0].content, `${name}.csv`, "text/csv; charset=utf-8");
      return file(markdownToPdf(b.markdown, `${b.title} — ${company.name}`), `${name}.pdf`, "application/pdf");
    }
    if (type === "rapport") {
      const st = await getState(companyId);
      const r = st.reports.find((x) => x.id === url.searchParams.get("id")) ?? st.reports[0];
      if (!r) throw new WorkspaceError("Aucun rapport hebdomadaire généré.", 404);
      if (format === "md") return file(r.markdown, `rapport-hebdo-${base}-${r.periodEnd}.md`, "text/markdown; charset=utf-8");
      return file(markdownToPdf(r.markdown, r.title), `rapport-hebdo-${base}-${r.periodEnd}.pdf`, "application/pdf");
    }
    if (type === "dd") {
      const dd = await dueDiligence(companyId, { id: url.searchParams.get("id") ?? undefined, name: url.searchParams.get("name") ?? undefined });
      const md = dueDiligenceMarkdown(dd);
      if (format === "md") return file(md, `due-diligence-${slug(dd.counterparty.name)}.md`, "text/markdown; charset=utf-8");
      return file(markdownToPdf(md, `Due diligence — ${dd.counterparty.name}`), `due-diligence-${slug(dd.counterparty.name)}.pdf`, "application/pdf");
    }
    throw new WorkspaceError("Type d'export inconnu.");
  } catch (error) {
    if (error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
  }
}
