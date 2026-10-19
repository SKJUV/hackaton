/** Configuration d'environnement du module (aucun secret renvoyé : uniquement des booléens). */

export function appBaseUrl(fallback?: string): string {
  return (process.env.APP_URL || fallback || "http://localhost:3000").replace(/\/$/, "");
}

/** URI de redirection OAuth UNIQUE pour tous les fournisseurs (à déclarer dans chaque console). */
export function oauthRedirectUri(base?: string): string {
  return `${appBaseUrl(base)}/api/mcp/oauth/callback`;
}

/**
 * Envoi vers des tiers (Gmail/Outlook « envoyer », WhatsApp, Slack…) :
 *  simulation (défaut, = MAIL_MODE) → l'appel est journalisé « simulé », rien ne part ;
 *  live → envoi réel, toujours après validation humaine.
 */
export function connectorSendMode(): "simulation" | "live" {
  const v = (process.env.CONNECTORS_SEND_MODE || process.env.MAIL_MODE || "simulation").toLowerCase();
  return v === "live" ? "live" : "simulation";
}

export const stdioAllowed = () => process.env.MCP_ALLOW_STDIO === "true" && process.env.NODE_ENV !== "production";

export const env = (name: string) => (process.env[name] ?? "").trim();
export const hasEnv = (...names: string[]) => names.every((n) => Boolean(env(n)));
