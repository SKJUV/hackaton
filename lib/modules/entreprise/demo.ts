import type { DemoIntent } from "@/lib/agent/registry";
import type { ToolResult } from "@/lib/agent/tools";

/**
 * Intentions du planificateur DÉMO (sans clé IA) pour le module entreprise.
 * Elles appellent exactement les mêmes outils que l'agent LLM.
 */

export const ENTREPRISE_INTENTS: { name: string; test: RegExp }[] = [
  { name: "ent_dataroom", test: /data ?room|salle de donnees|dossier investisseurs?\b/ },
  { name: "ent_dd", test: /due diligence|diligence|(verifie|verifier|analyse|analyser|evalue|evaluer) (le |la |l.|ce |cet |cette )?(partenaire|fournisseur|client|investisseur)|est-il fiable|est-elle fiable/ },
  { name: "ent_export", test: /(rapport|export|dossier|etats?)[^.]{0,40}(investisseurs?|banque|bancaire|banquier|fisc|fiscal|impots)/ },
  { name: "ent_rapport", test: /rapport (executif|hebdo|de la semaine)|rapport hebdomadaire/ },
  { name: "ent_stress", test: /stress|scenarios?|simulation|simule|et si (les|mes|nos)/ },
  { name: "ent_risque", test: /profil de risques?|risques? (de change|client|operationnel|reglementaire|de credit)|cartographie des risques/ },
  { name: "ent_ao", test: /appels? d.offres?|marches publics|avis de marche|soumissionner/ },
  { name: "ent_veille", test: /veille (sectorielle|economique|concurrentielle|marche)|concurren|signaux faibles|matieres premieres/ },
  { name: "ent_finance", test: /tresorerie|budget|depenses|revenus|cash|burn|runway|autonomie financiere|tableau (de bord )?financier/ },
  { name: "ent_anomalies", test: /anomalies?|incoherences?|erreurs? (de saisie|dans (mes|les) donnees)/ },
  { name: "ent_dashboard", test: /tableaux? de bord|dashboard|kpi|indicateurs?|mes (ventes|donnees|chiffres)/ },
  { name: "ent_import", test: /\b(importe|importer|import|charger)\b.*\b(csv|excel|xlsx|fichiers?|donnees)\b/ },
];

/** Intentions entreprise détectées dans un message normalisé (sans accents, minuscules), dans l'ordre de traitement. */
export function entrepriseIntentNames(normalized: string): string[] {
  const ent = ENTREPRISE_INTENTS.filter((i) => i.test.test(normalized)).map((i) => i.name);
  // La data room inclut déjà les chiffres : pas d'export financier en doublon.
  return ent.includes("ent_dataroom") ? ["ent_dataroom", ...ent.filter((e) => e !== "ent_dataroom" && e !== "ent_export")] : ent;
}

/**
 * Précédence sur les intentions génériques du cœur (appelé par detectIntents) : une due diligence ou une data room
 * ne doit pas déclencher de devis, d'email ou de document non demandés ; la veille sectorielle remplace la veille
 * réglementaire générique ; les questions de finances ne déclenchent pas le score de conformité.
 */
export function filterCoreIntents(ent: string[], found: string[]): string[] {
  let rest = found;
  if (ent.includes("ent_dd") || ent.includes("ent_dataroom")) rest = rest.filter((f) => f !== "devis" && f !== "email" && f !== "document");
  if (ent.includes("ent_veille")) rest = rest.filter((f) => f !== "veille");
  if (ent.includes("ent_finance") || ent.includes("ent_export") || ent.includes("ent_stress")) rest = rest.filter((f) => f !== "conformite");
  return rest.filter((f) => f !== "juridique");
}

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
type Call = (name: string, input: Record<string, unknown>) => Promise<ToolResult | null>;
type D = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const exampleWarn = (d: D | undefined) => (d?.avertissement ? "\n_⚠️ Données d'exemple (fictives) : importez vos fichiers pour des chiffres réels._" : "");

export async function runEntrepriseIntent(intent: string, message: string, call: Call): Promise<string[]> {
  const m = norm(message);
  const out: string[] = [];
  switch (intent) {
    case "ent_import":
      out.push("📥 Pour importer vos fichiers **CSV ou Excel (.xlsx)** de ventes, finances, RH ou clients, ouvrez l'onglet **Entreprise › Données** (/workspace#data) (glisser-déposer). Vous pouvez aussi coller un CSV dans la conversation : je le structurerai.");
      break;
    case "ent_dashboard": {
      const r = await call("entreprise_tableau_de_bord_donnees", {});
      const d = r?.data as D | undefined;
      if (r) out.push(`📊 **${r.summary}**\n${(d?.tableaux ?? []).map((t: D) => `- ${t.domaine} : ${t.indicateurs.slice(0, 3).map((k: D) => `${k.label} ${fmt(k.value)}${k.unit ? ` ${k.unit}` : ""}`).join(" · ")}`).join("\n")}${exampleWarn(d)}`);
      break;
    }
    case "ent_anomalies": {
      const r = await call("entreprise_detecter_anomalies", {});
      const d = r?.data as D | undefined;
      if (r) out.push(`🔎 **${r.summary}**\n${(d?.anomalies ?? []).slice(0, 6).map((a: D) => `- ${a.severity === "critique" ? "⛔" : a.severity === "attention" ? "⚠️" : "ℹ️"} ${a.title} — ${a.detail}`).join("\n")}${exampleWarn(d)}`);
      break;
    }
    case "ent_rapport": {
      const r = await call("entreprise_rapport_hebdomadaire", {});
      if (r) out.push(`🗞️ ${r.summary}. Retrouvez-le dans **Documents** et dans **Entreprise › Données** (/workspace#data).`);
      break;
    }
    case "ent_finance": {
      const r = await call("entreprise_tableau_financier", {});
      const d = r?.data as D | undefined;
      if (r) out.push(`💰 **${r.summary}**${d?.totaux?.runwayMonths ? ` · autonomie ${d.totaux.runwayMonths} mois` : ""}\n${(d?.alertes ?? []).map((a: D) => `- ${a.severity === "critique" ? "⛔" : "⚠️"} ${a.title}`).join("\n") || "- Aucune alerte de trésorerie."}${exampleWarn(d)}`);
      break;
    }
    case "ent_export": {
      const cible = /fisc|impot/.test(m) ? "fisc" : /banq/.test(m) ? "banque" : "investisseurs";
      const r = await call("entreprise_exporter_rapport_financier", { cible });
      const d = r?.data as D | undefined;
      if (r) out.push(`📑 ${r.summary}. Téléchargement : [PDF](${d?.telechargements?.pdf}) · [ZIP](${d?.telechargements?.zip}).${d?.fondement_juridique ? `\n  ↳ ${d.fondement_juridique.statut === "non_couvert" ? "⚠️ " : "⚖️ "}Obligations fiscales : ${d.fondement_juridique.libelle}` : ""}`);
      break;
    }
    case "ent_veille": {
      const r = await call("entreprise_veille_sectorielle", {});
      const d = r?.data as D | undefined;
      if (r) out.push(`📡 **${r.summary}**\n${(d?.reglementaire ?? []).slice(0, 3).map((a: D) => `- Texte officiel : ${a.titre}`).join("\n")}\n${(d?.signaux_exemple ?? []).slice(0, 2).map((s: D) => `- ${s.title} → ${s.action}`).join("\n")}${(d?.macro ?? []).length ? `\n${d!.macro.slice(0, 2).map((x: D) => `- ${x.label} (${x.year}) : ${x.value} — source ${x.source}`).join("\n")}` : ""}`);
      break;
    }
    case "ent_ao": {
      const r = await call("entreprise_alertes_appels_offres", {});
      const d = r?.data as D | undefined;
      if (r) out.push(`📢 **${r.summary}**\n${(d?.correspondants ?? []).slice(0, 3).map((t: D) => `- ${t.title} — échéance ${t.deadline ?? "non précisée"} ([avis](${t.url}))`).join("\n")}${(d?.exemples ?? []).length ? `\n${d!.exemples.slice(0, 2).map((t: D) => `- (exemple) ${t.title}`).join("\n")}` : ""}\nPortails officiels : ${(d?.portails_officiels ?? []).map((p: D) => p.name.split(" — ")[0]).join(", ")}.`);
      break;
    }
    case "ent_risque": {
      const r = await call("entreprise_profil_risque", {});
      const d = r?.data as D | undefined;
      if (r) out.push(`🛡️ **${r.summary}**\n${(d?.axes ?? []).map((a: D) => `- ${a.label} : ${a.score}/100 (${a.level})`).join("\n")}${d?.fondement_juridique ? `\n  ↳ ${d.fondement_juridique.statut === "non_couvert" ? "⚠️ " : "⚖️ "}${d.fondement_juridique.libelle}` : ""}${exampleWarn(d)}`);
      break;
    }
    case "ent_stress": {
      const pct = m.match(/(\d{1,2}) ?%/)?.[1];
      const r = await call("entreprise_simulation_stress", pct && /vente|chiffre/.test(m) ? { baisse_ventes_pct: Number(pct) } : {});
      const d = r?.data as D | undefined;
      if (r) out.push(`🧪 **${r.summary}**\n${(d?.scenarios ?? []).map((s: D) => `- ${s.label} : solde minimum ${fmt(s.minBalance)} (${s.minPeriod})${s.breach ? ` — ⛔ rupture en ${s.breach}` : ""}`).join("\n")}${exampleWarn(d)}`);
      break;
    }
    case "ent_dd": {
      const name = message.match(/(?:de|du|sur|pour)\s+(?:la |le |l'|l’)?(?:soci[ée]t[ée] |partenaire |fournisseur |client |investisseur )?([A-ZÀ-Ý][\w&'’ .-]{2,60}?)(?:\s*[?.!,]|$)/)?.[1]?.trim();
      const kind = /investisseur/.test(m) ? "investisseur" : /fournisseur/.test(m) ? "fournisseur" : /client/.test(m) ? "client" : "partenaire";
      if (!name) {
        out.push("🔍 Indiquez le nom de la contrepartie, par ex. « due diligence de Wouri Angels ». Les fiches existantes sont dans **Entreprise › Due diligence** (/workspace#due-diligence).");
        break;
      }
      const r = await call("entreprise_due_diligence", { nom: name, type: kind });
      const d = r?.data as D | undefined;
      if (r) out.push(`🔍 **Due diligence — ${r.summary}**\n${(d?.signaux ?? []).slice(0, 5).map((s: D) => `- ${s.label}`).join("\n")}\nChecklist juridique :\n${(d?.checklist ?? []).map((c: D) => `- ${c.point} — ${c.statut === "non_couvert" ? "⚠️ non couvert par le corpus" : c.fondement}`).join("\n")}\nFiche enregistrée dans **Documents**.`);
      break;
    }
    case "ent_dataroom": {
      const r = await call("entreprise_generer_data_room", {});
      const d = r?.data as D | undefined;
      if (r) out.push(`🗂️ **${r.summary}**\n${(d?.sections ?? []).map((s: D) => `- ${s.titre} : ${s.statut}`).join("\n")}\nExports : [ZIP](${d?.telechargements?.zip}) · [PDF](${d?.telechargements?.pdf}).${exampleWarn(d)}`);
      break;
    }
  }
  return out;
}

/** Intention unique déclarée au registre : elle exécute, dans l'ordre, les intentions entreprise détectées. */
export const ENTREPRISE_DEMO_INTENT: DemoIntent = {
  name: "entreprise",
  test: new RegExp(ENTREPRISE_INTENTS.map((i) => `(?:${i.test.source})`).join("|")),
  async run({ message, call }) {
    const out: string[] = [];
    for (const intent of entrepriseIntentNames(norm(message))) out.push(...(await runEntrepriseIntent(intent, message, call)));
    return out.length ? out.join("\n\n") : null;
  },
};
