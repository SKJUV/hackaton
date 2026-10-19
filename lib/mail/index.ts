/**
 * Envoi d'emails : fournisseur configurable.
 *
 *  MAIL_MODE=simulation (défaut) → aucun envoi réseau ; l'email apparaît « simulé » dans la boîte d'envoi.
 *  MAIL_MODE=live + MAIL_PROVIDER=resend|smtp → envoi réel (après approbation humaine uniquement).
 *
 * Les secrets ne sont jamais renvoyés au client ni journalisés.
 */
export type OutgoingMail = { from: string; to: string[]; cc?: string[]; subject: string; text: string };
export type SendResult = { ok: true; provider: string; simulated: boolean; messageId: string } | { ok: false; provider: string; error: string };

export type MailConfigStatus = {
  mode: "simulation" | "live";
  provider: "simulation" | "resend" | "smtp";
  configured: boolean;
  from: string;
  warning?: string;
};

export function getMailConfig(): MailConfigStatus {
  const mode = process.env.MAIL_MODE === "live" ? "live" : "simulation";
  const from = process.env.MAIL_FROM || "Co-fondateur IA <no-reply@example.com>";
  if (mode === "simulation") return { mode, provider: "simulation", configured: true, from };
  const provider = process.env.MAIL_PROVIDER === "smtp" ? "smtp" : "resend";
  const configured =
    provider === "resend" ? Boolean(process.env.RESEND_API_KEY) : Boolean(process.env.SMTP_HOST);
  return {
    mode,
    provider,
    configured,
    from,
    warning: configured ? undefined : `MAIL_MODE=live mais ${provider === "resend" ? "RESEND_API_KEY" : "SMTP_HOST"} est absent : les envois échoueront.`,
  };
}

async function sendWithResend(mail: OutgoingMail): Promise<SendResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: mail.from, to: mail.to, cc: mail.cc, subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(20000),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok) return { ok: false, provider: "resend", error: body.message || `HTTP ${response.status}` };
  return { ok: true, provider: "resend", simulated: false, messageId: body.id || "resend" };
}

async function sendWithSmtp(mail: OutgoingMail): Promise<SendResult> {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  const info = await transport.sendMail({ from: mail.from, to: mail.to, cc: mail.cc, subject: mail.subject, text: mail.text });
  return { ok: true, provider: "smtp", simulated: false, messageId: info.messageId };
}

export async function sendMail(mail: Omit<OutgoingMail, "from"> & { from?: string }): Promise<SendResult> {
  const config = getMailConfig();
  const full: OutgoingMail = { ...mail, from: mail.from || config.from };
  if (config.mode === "simulation") {
    return { ok: true, provider: "simulation", simulated: true, messageId: `sim_${Date.now().toString(36)}` };
  }
  if (!config.configured) return { ok: false, provider: config.provider, error: config.warning || "Fournisseur email non configuré." };
  try {
    return config.provider === "smtp" ? await sendWithSmtp(full) : await sendWithResend(full);
  } catch (error) {
    return { ok: false, provider: config.provider, error: error instanceof Error ? error.message : "Erreur d'envoi" };
  }
}
