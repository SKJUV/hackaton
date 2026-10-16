import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current";
import { toPublic } from "@/lib/auth/service";
import { usingDevSecret } from "@/lib/auth/session";
import { getPlan } from "@/lib/billing/plans";
import { getActiveSubscription, hasAssistantAccess, listSubscriptions, paywallEnabled } from "@/lib/billing/service";
import { getMailConfig } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  const sub = user ? await getActiveSubscription(user.id) : null;
  return NextResponse.json({
    user: user ? toPublic(user) : null,
    subscription: sub ? { ...sub, plan: getPlan(sub.planId) } : null,
    history: user ? await listSubscriptions(user.id) : [],
    assistantAccess: await hasAssistantAccess(user),
    paywall: paywallEnabled(),
    mailMode: getMailConfig().mode,
    devSecret: usingDevSecret() && process.env.NODE_ENV === "production",
  });
}
