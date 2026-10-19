import { NextResponse } from "next/server";
import { verifyWhatsAppSignature, whatsappVerifyChallenge } from "@/lib/modules/mcp/webhooks";
import { ingestWhatsAppWebhook } from "@/lib/modules/mcp/inbox";

export const runtime = "nodejs";

/** Vérification du webhook Meta (hub.challenge). */
export async function GET(request: Request) {
  const challenge = whatsappVerifyChallenge(new URL(request.url).searchParams);
  return challenge === null ? new NextResponse("Forbidden", { status: 403 }) : new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/** Réception des messages WhatsApp (signature X-Hub-Signature-256 vérifiée avec META_APP_SECRET). */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  try {
    const result = await ingestWhatsAppWebhook(JSON.parse(raw));
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
