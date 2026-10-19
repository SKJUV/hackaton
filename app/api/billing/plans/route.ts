import { NextResponse } from "next/server";
import { getPlans } from "@/lib/billing/plans";
import { configuredProvider } from "@/lib/billing/providers";
import { paywallEnabled } from "@/lib/billing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const p = configuredProvider();
  return NextResponse.json({ plans: getPlans(), provider: { id: p.id, configured: p.configured }, paywall: paywallEnabled() });
}
