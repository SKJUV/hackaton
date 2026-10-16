import { createCompany } from "@/lib/workspace/service";
import { handle, readJson, s } from "@/lib/workspace/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handle(async () => {
    const b = await readJson(request);
    return createCompany({
      name: s(b.name),
      sector: s(b.sector),
      legalForm: s(b.legalForm) || undefined,
      city: s(b.city) || undefined,
      description: s(b.description) || undefined,
      ownerName: s(b.ownerName) || undefined,
      ownerEmail: s(b.ownerEmail) || undefined,
      capital: typeof b.capital === "number" ? b.capital : undefined,
      sectorKeywords: Array.isArray(b.sectorKeywords) ? b.sectorKeywords.filter((k): k is string => typeof k === "string") : undefined,
    });
  });
}
