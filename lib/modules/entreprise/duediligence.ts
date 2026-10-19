import { readData } from "@/lib/workspace/store";
import { WorkspaceError } from "@/lib/workspace/service";
import { sumBy } from "./analytics";
import { legalChecklist, type CitedPoint } from "./legal";
import { stateFrom } from "./service";
import { norm } from "./structure";
import type { Counterparty, CounterpartyKind, Severity } from "./types";

/**
 * Due diligence des partenaires, fournisseurs, clients et investisseurs :
 * fiche de signaux à partir des données DISPONIBLES dans le workspace (imports, annuaire, devis, notes),
 * complétée d'une checklist juridique citée depuis le corpus officiel.
 * Aucun registre externe n'est interrogé (pas d'API publique vérifiée) : c'est indiqué dans la fiche.
 */

export type Signal = { severity: Severity | "positif"; label: string; source: string };
export type DueDiligence = {
  counterparty: Counterparty;
  score: number;
  verdict: "favorable" | "vigilance" | "defavorable";
  signals: Signal[];
  checklist: CitedPoint[];
  missing: string[];
  limits: string[];
  isExample: boolean;
};

const RED_FLAGS: [RegExp, string, Severity][] = [
  [/litige|contentieux|proces/, "Litige ou contentieux signalé", "critique"],
  [/contest|reclamation/, "Factures contestées / réclamations", "attention"],
  [/impaye|retard/, "Retards ou impayés signalés", "attention"],
  [/100 ?%.*commande|paiement (exige|integral)/, "Paiement intégral exigé à la commande", "attention"],
  [/pas de reference|aucune reference|non verifiable|creee recemment|recemment/, "Références non vérifiables / structure récente", "attention"],
  [/siege au conseil|droit de veto|veto/, "Demande de gouvernance à négocier (siège, veto)", "info"],
  [/usd|dollar|devise/, "Facturation en devise étrangère (risque de change)", "info"],
];

export async function listCounterparties(companyId: string) {
  const data = await readData();
  const st = stateFrom(data, companyId);
  const suppliers = data.suppliers.map((s) => ({ id: `sup:${s.id}`, name: s.name, kind: "fournisseur" as CounterpartyKind, country: "Cameroun", city: s.city, isExample: s.isExample, fromDirectory: true }));
  return [...st.counterparties.map((c) => ({ id: c.id, name: c.name, kind: c.kind, country: c.country, city: c.city, isExample: c.isExample, fromDirectory: false })), ...suppliers];
}

export async function dueDiligence(companyId: string, ref: { id?: string; name?: string; kind?: CounterpartyKind }): Promise<DueDiligence> {
  const data = await readData();
  const st = stateFrom(data, companyId);
  const q = norm(ref.name ?? "");
  let cp: Counterparty | undefined = st.counterparties.find((c) => c.id === ref.id) ?? (q ? st.counterparties.find((c) => norm(c.name).includes(q) || q.includes(norm(c.name).replace(/ exemple$/, ""))) : undefined);
  const supplier = data.suppliers.find((s) => `sup:${s.id}` === ref.id || s.id === ref.id || (q && norm(s.name).includes(q)));
  if (!cp && supplier) cp = { id: `sup:${supplier.id}`, companyId, name: supplier.name, kind: "fournisseur", country: "Cameroun", city: supplier.city, notes: [supplier.description], isExample: supplier.isExample };
  if (!cp && ref.name) cp = { id: "adhoc", companyId, name: ref.name, kind: ref.kind ?? "partenaire", country: "Non renseigné", notes: [], isExample: false };
  if (!cp) throw new WorkspaceError("Contrepartie introuvable : indiquez son nom ou ajoutez-la dans l'onglet Due diligence.", 404);

  const signals: Signal[] = [];
  const missing: string[] = [];
  const cpKey = norm(cp.name).replace(/ exemple$/, "");
  const sameName = (v?: string) => Boolean(v && (norm(v).includes(cpKey) || cpKey.includes(norm(v).replace(/ exemple$/, ""))));

  // Données internes : ventes et encours clients.
  const ventes = st.datasets.filter((d) => d.domain === "ventes").flatMap((d) => d.rows.map((r) => ({ ...r, ex: d.isExample })));
  const totalSales = ventes.reduce((s, r) => s + (r.montant ?? 0), 0);
  const cpSales = ventes.filter((r) => sameName(r.client));
  if (cpSales.length) {
    const amount = cpSales.reduce((s, r) => s + (r.montant ?? 0), 0);
    const share = totalSales ? amount / totalSales : 0;
    const months = sumBy(cpSales, (r) => r.date?.slice(0, 7), () => 1).size;
    signals.push({ severity: "positif", label: `Historique commercial : ${cpSales.length} transactions sur ${months} mois (${new Intl.NumberFormat("fr-FR").format(Math.round(amount))} XAF).`, source: cpSales[0].ex ? "Ventes importées (exemple)" : "Ventes importées" });
    if (share > 0.25) signals.push({ severity: "attention", label: `Dépendance : ${Math.round(share * 100)} % du chiffre d'affaires.`, source: "Ventes importées" });
  }
  const clientRows = st.datasets.filter((d) => d.domain === "clients").flatMap((d) => d.rows.map((r) => ({ ...r, ex: d.isExample }))).filter((r) => sameName(r.client));
  for (const r of clientRows) {
    const late = r.jours_retard ?? 0;
    signals.push({ severity: late >= 90 ? "critique" : late >= 45 ? "attention" : "positif", label: late ? `Encours ${new Intl.NumberFormat("fr-FR").format(r.encours ?? 0)} XAF avec ${late} jours de retard.` : "Aucun retard de paiement constaté.", source: r.ex ? "Portefeuille clients (exemple)" : "Portefeuille clients" });
  }
  // Annuaire fournisseurs et historique des devis.
  if (supplier) {
    signals.push({ severity: supplier.rating >= 4.2 ? "positif" : supplier.rating < 3.8 ? "attention" : "info", label: `Note annuaire : ${supplier.rating}/5.`, source: supplier.isExample ? "Annuaire fournisseurs (exemple)" : "Annuaire fournisseurs" });
    const quotes = data.quotes.filter((x) => x.companyId === companyId && x.supplierId === supplier.id);
    if (quotes.length) {
      const answered = quotes.filter((x) => x.response).length;
      const relances = quotes.reduce((s, x) => s + x.followUpCount, 0);
      signals.push({ severity: answered ? "positif" : relances ? "attention" : "info", label: `${quotes.length} demande(s) de devis, ${answered} réponse(s), ${relances} relance(s).`, source: "Suivi des devis" });
    }
  }
  // Profil déclaré.
  if (cp.yearsActive !== undefined) signals.push({ severity: cp.yearsActive < 2 ? "attention" : cp.yearsActive >= 5 ? "positif" : "info", label: `Ancienneté déclarée : ${cp.yearsActive} an(s).`, source: cp.isExample ? "Fiche contrepartie (exemple)" : "Fiche contrepartie" });
  else missing.push("Ancienneté / date de création");
  if (!cp.registration) missing.push("Numéro d'immatriculation (registre du commerce)");
  else signals.push({ severity: "info", label: `Immatriculation déclarée : ${cp.registration} (non vérifiée auprès du registre).`, source: "Fiche contrepartie" });
  if (cp.country && !/cameroun/i.test(cp.country) && cp.country !== "Non renseigné") signals.push({ severity: "info", label: `Contrepartie étrangère (${cp.country}) : droit applicable, devise et recouvrement à prévoir au contrat.`, source: "Fiche contrepartie" });
  if (cp.publicFinancials) {
    const f = cp.publicFinancials;
    if (f.revenue === undefined && f.result === undefined) missing.push(`États financiers ${f.year} (annoncés : ${f.source})`);
    else signals.push({ severity: (f.result ?? 0) < 0 ? "attention" : "positif", label: `Comptes ${f.year} : CA ${f.revenue ?? "non communiqué"}, résultat ${f.result ?? "non communiqué"}.`, source: f.source });
  } else missing.push("Situation financière publique (états financiers)");
  for (const note of cp.notes) {
    const n = norm(note);
    const flag = RED_FLAGS.find(([re]) => re.test(n));
    signals.push({ severity: flag ? flag[2] : "info", label: flag ? `${flag[1]} — « ${note} »` : note, source: cp.isExample ? "Notes (exemple)" : "Notes" });
  }

  const weight: Record<Signal["severity"], number> = { positif: 8, info: 0, attention: -12, critique: -25 };
  const score = Math.max(0, Math.min(100, Math.round(60 + signals.reduce((s, x) => s + weight[x.severity], 0) - missing.length * 4)));
  const checklist = await legalChecklist(cp.kind);
  return {
    counterparty: cp,
    score,
    verdict: score >= 65 ? "favorable" : score >= 40 ? "vigilance" : "defavorable",
    signals,
    checklist,
    missing,
    limits: [
      "Fiche fondée uniquement sur les données disponibles dans le workspace (imports, annuaire, devis, notes) : aucun registre public n'est interrogé automatiquement.",
      "Réputation et presse : non connectées (aucune source officielle branchée) — à compléter manuellement.",
      "La checklist juridique cite le corpus officiel ; « non couvert » signifie qu'aucun texte disponible ne traite le point.",
    ],
    isExample: cp.isExample,
  };
}

export function dueDiligenceMarkdown(dd: DueDiligence): string {
  const icon: Record<Signal["severity"], string> = { positif: "✅", info: "ℹ️", attention: "⚠️", critique: "⛔" };
  return [
    `# Due diligence — ${dd.counterparty.name}${dd.isExample ? " (EXEMPLE)" : ""}`,
    "",
    `- Type : ${dd.counterparty.kind} · Pays : ${dd.counterparty.country}`,
    `- Score de confiance : **${dd.score}/100** — verdict : **${dd.verdict}**`,
    "",
    "## Signaux",
    ...dd.signals.map((s) => `- ${icon[s.severity]} ${s.label} _(source : ${s.source})_`),
    "",
    "## Informations manquantes",
    ...(dd.missing.length ? dd.missing.map((m) => `- ${m}`) : ["- Aucune"]),
    "",
    "## Checklist juridique (corpus officiel)",
    ...dd.checklist.map((p) => (p.status === "non_couvert" ? `- ☐ ${p.label} — ⚠️ ${p.statusLabel}` : `- ☐ ${p.label} — ${p.statusLabel}`)),
    "",
    "## Limites",
    ...dd.limits.map((l) => `- ${l}`),
  ].join("\n");
}
