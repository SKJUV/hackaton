import { assertCompanyAccess } from "@/lib/workspace/access";
import { handlePaid, readJson, s } from "@/lib/workspace/http";
import { WorkspaceError } from "@/lib/workspace/service";
import { buildDataRoom } from "@/lib/modules/entreprise/dataroom";
import { dueDiligence, listCounterparties } from "@/lib/modules/entreprise/duediligence";
import { riskProfile, runStress, sectorWatch, tenderAlerts } from "@/lib/modules/entreprise/insights";
import { generateWeeklyReport } from "@/lib/modules/entreprise/reports";
import { addCounterparty, dataOverview, deleteDataset, financeOverview, getState, importData, loadExampleData, setBudget, updateSettings } from "@/lib/modules/entreprise/service";
import type { CounterpartyKind, DatasetDomain } from "@/lib/modules/entreprise/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const kw = (v: string | null) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined);
const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : undefined);

/** Module entreprise (niveau 2) : lecture des vues. Réservé à l'offre payante, contrôle d'appartenance par entreprise. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId") ?? "";
  const view = url.searchParams.get("view") ?? "data";
  return handlePaid(async (viewer) => {
    await assertCompanyAccess(companyId, viewer);
    switch (view) {
      case "data":
        return dataOverview(companyId);
      case "finance": {
        const f = await financeOverview(companyId);
        const st = await getState(companyId);
        return { ...f, budgetLines: st.budgets };
      }
      case "veille":
        return sectorWatch(companyId, { keywords: kw(url.searchParams.get("keywords")) });
      case "appels":
        return tenderAlerts(companyId, { keywords: kw(url.searchParams.get("keywords")) });
      case "risques":
        return riskProfile(companyId);
      case "stress":
        return runStress(companyId);
      case "contreparties":
        return listCounterparties(companyId);
      case "dataroom": {
        const dr = await buildDataRoom(companyId);
        return { ...dr, sections: dr.sections.map((x) => ({ ...x, markdown: x.markdown.slice(0, 6000) })), csv: dr.csv.map((c) => c.name) };
      }
      default:
        throw new WorkspaceError("Vue inconnue.");
    }
  });
}

/** Actions : import, paramètres, budget, rapport, contreparties, due diligence, stress personnalisé. */
export async function POST(request: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(request);
    const companyId = s(b.companyId);
    await assertCompanyAccess(companyId, viewer);
    const actor = viewer.user?.name ?? "utilisateur";
    switch (s(b.action)) {
      case "import":
        return importData(companyId, { fileName: s(b.fileName), text: typeof b.text === "string" ? b.text : undefined, base64: typeof b.base64 === "string" ? b.base64 : undefined, domain: (s(b.domain) || undefined) as DatasetDomain | undefined, name: s(b.name) || undefined }, actor);
      case "supprimer_table":
        return deleteDataset(companyId, s(b.datasetId), actor);
      case "charger_exemple":
        return loadExampleData(companyId, actor);
      case "parametres":
        return updateSettings(companyId, { openingCash: n(b.openingCash), safetyCash: n(b.safetyCash), fxShare: n(b.fxShare), openingDate: s(b.openingDate) || undefined }, actor);
      case "budget":
        return setBudget(companyId, Array.isArray(b.lines) ? (b.lines as { category: string; monthly: number }[]) : [], actor);
      case "rapport":
        return generateWeeklyReport(companyId, { trigger: "manuel", actor });
      case "contrepartie":
        return addCounterparty(companyId, { name: s(b.name), kind: s(b.kind) as CounterpartyKind, country: s(b.country) || undefined, city: s(b.city) || undefined, registration: s(b.registration) || undefined, yearsActive: n(b.yearsActive), notes: s(b.notes).split("\n") }, actor);
      case "due_diligence":
        return dueDiligence(companyId, { id: s(b.id) || undefined, name: s(b.name) || undefined, kind: (s(b.kind) || undefined) as CounterpartyKind | undefined });
      case "stress":
        return runStress(companyId, { label: s(b.label) || undefined, revenueShock: n(b.revenueShock), expenseShock: n(b.expenseShock), fxShock: n(b.fxShock), paymentDelayDays: n(b.paymentDelayDays), loseTopClient: b.loseTopClient === true });
      default:
        throw new WorkspaceError("Action inconnue.");
    }
  });
}
