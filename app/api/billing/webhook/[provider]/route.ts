import { NextResponse } from "next/server";
import { verifyHmacSignature, verifyStripeSignature } from "@/lib/billing/providers";
import { confirmSubscription } from "@/lib/billing/service";

export const runtime = "nodejs";

/**
 * Notifications des prestataires. On ne fait jamais confiance au contenu seul :
 * signature vérifiée (Stripe, NotchPay) et/ou re-vérification du statut auprès du prestataire.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await request.text();
  try {
    if (provider === "stripe") {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret || !verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
      const event = JSON.parse(raw) as { type?: string; data?: { object?: { id?: string; client_reference_id?: string } } };
      if (event.type === "checkout.session.completed" && event.data?.object?.client_reference_id) {
        await confirmSubscription(event.data.object.client_reference_id, { session_id: event.data.object.id ?? "" });
      }
      return NextResponse.json({ received: true });
    }
    if (provider === "notchpay") {
      const secret = process.env.NOTCHPAY_WEBHOOK_SECRET;
      if (!secret || !verifyHmacSignature(raw, request.headers.get("x-notch-signature"), secret)) return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
      const event = JSON.parse(raw) as { data?: { reference?: string; merchant_reference?: string } };
      const ref = event.data?.merchant_reference ?? event.data?.reference;
      if (ref) await confirmSubscription(ref);
      return NextResponse.json({ received: true });
    }
    if (provider === "cinetpay") {
      // CinetPay envoie cpm_trans_id (form-urlencoded) ; le statut est re-vérifié via l'API /payment/check.
      const params = new URLSearchParams(raw);
      const ref = params.get("cpm_trans_id") ?? (raw.startsWith("{") ? (JSON.parse(raw) as { cpm_trans_id?: string }).cpm_trans_id : undefined);
      if (ref) await confirmSubscription(ref);
      return NextResponse.json({ received: true });
    }
    return NextResponse.json({ error: "Prestataire inconnu" }, { status: 404 });
  } catch (error) {
    console.error("Webhook paiement:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
