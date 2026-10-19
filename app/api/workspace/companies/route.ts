import { currentUser } from "@/lib/auth/current";
import { createCompany } from "@/lib/workspace/service";
import { handlePaid, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handlePaid(async () => {
    const b = await readJson(request);
    const user = await currentUser();
    return createCompany({
      name: s(b.name),
      sector: s(b.sector),
      legalForm: s(b.legalForm) || undefined,
      city: s(b.city) || undefined,
      description: s(b.description) || undefined,
      ownerName: s(b.ownerName) || user?.name || undefined,
      ownerEmail: user?.email || s(b.ownerEmail) || undefined,
      capital: typeof b.capital === "number" ? b.capital : undefined,
      sectorKeywords: Array.isArray(b.sectorKeywords) ? b.sectorKeywords.filter((k): k is string => typeof k === "string") : undefined,
    });
  });
}
