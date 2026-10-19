export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Racine grossière (6 caractères) pour rapprocher pluriels et variantes. */
export const stem = (w: string) => w.slice(0, 6);

export function words(s: string): string[] {
  return norm(s).split(/[^a-z0-9+#]+/).filter((w) => w.length > 1);
}

/** Vrai si le mot-clé (éventuellement composé) apparaît dans le texte normalisé. */
export function hasKeyword(text: string, keyword: string): boolean {
  const t = ` ${norm(text).replace(/[^a-z0-9+#]+/g, " ")} `;
  const k = norm(keyword).replace(/[^a-z0-9+#]+/g, " ").trim();
  if (!k) return false;
  if (k.includes(" ")) return t.includes(` ${k} `) || t.includes(` ${k}s `);
  if (k.length <= 4) return t.includes(` ${k} `) || t.includes(` ${k}s `);
  const ws = t.split(" ");
  return ws.some((w) => w === k || (w.length >= 5 && stem(w) === stem(k)));
}

export const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
export const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
export const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : v === "true" || v === "oui" ? true : v === "false" || v === "non" ? false : undefined);
export const strArr = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : typeof v === "string" ? v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean) : [];

/**
 * Garde-fou « jamais de vrai contact pendant le dev » (conventions §5) : hors domaine example.com, l'adresse réelle
 * est remplacée par une adresse de démo, sauf si COFOUNDER_ALLOW_REAL_RECIPIENTS=true (production, après validation).
 * L'adresse officielle reste affichée à l'utilisateur ; rien ne part sans approbation dans tous les cas.
 */
export function guardRecipient(address: string, demoLocal: string): { to: string; officialContact?: string } {
  const a = address.trim();
  if (/@([a-z0-9-]+\.)*example\.com$/i.test(a) || process.env.COFOUNDER_ALLOW_REAL_RECIPIENTS === "true") return { to: a };
  return { to: `${demoLocal.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}@demo.example.com`, officialContact: a };
}
