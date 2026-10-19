import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/current";
import { fail } from "@/lib/auth/http";
import { BillingError, cancelSubscription } from "@/lib/billing/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await currentUser();
    if (!user) throw new BillingError("Non connecté.", 401);
    return NextResponse.json({ canceled: await cancelSubscription(user.id) });
  } catch (error) {
    return fail(error);
  }
}
