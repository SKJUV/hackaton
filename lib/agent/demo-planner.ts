import type { Citation } from "@/lib/legal/citations";
import type { Company, ToolTrace } from "@/lib/workspace/types";
import { DEMO_INTENTS, TOOL_MAP } from "./registry";
import { entrepriseIntentNames, filterCoreIntents } from "@/lib/modules/entreprise/demo";
import type { ToolContext } from "./tools";
import { summarizeGrounding } from "./grounding-summary";

type Basis = { statut: string; libelle: string };
const basisOf = (data: unknown): Basis | undefined => (data as { fondement_juridique?: Basis } | undefined)?.fondement_juridique;
const basisLine = (data: unknown) => {
  const b = basisOf(data);
  return b ? `\n  ↳ ${b.statut === "non_couvert" ? "⚠️ " : "⚖️ "}${b.libelle}` : "";
};
const cite = (c: Citation) => `${c.legalTitle ?? c.title}, page ${c.page}${c.articles.length ? `, art. ${c.articles.slice(0, 3).join(", ")}` : ""}`;

/**
 * Planificateur SEED (sans clé IA) : détecte les intentions par règles et appelle
 * exactement les mêmes outils que l'agent LLM, pour montrer le fonctionnement réel du produit.
 */

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Intent = { name: string; test: RegExp };
const INTENTS: Intent[] = [
  { name: "devis", test: /\b(devis|fournisseurs?|prestataires?|acheter|commander|cotation|achat)\b/ },
  { name: "relance", test: /\b(relance|relancer)\b/ },
  { name: "email", test: /\b(e-?mail|mail|courriel|ecris a|ecrire a|envoie a|envoyer a)\b|@/ },
  { name: "business_plan", test: /business ?plan|plan d.affaires/ },
  { name: "roadmap", test: /roadmap|feuille de route|plan d.action/ },
  { name: "document", test: /\b(statuts|contrat|nda|confidentialite|proces-verbal|pv d)\b/ },
  { name: "checklist", test: /\b(checklist|demarches?|etapes|immatricul|formalites|creer (mon|une|l.)entreprise|creation d.entreprise)\b/ },
  { name: "conformite", test: /\b(conformite|score)\b/ },
  { name: "calendrier", test: /\b(calendrier|echeances?|obligations?|impots?|fiscal|declarations?)\b/ },
  { name: "veille", test: /\b(veille|nouveaux textes|reglementaire)\b/ },
  { name: "tache", test: /\b(rappel|rappelle|tache|n.oublie)\b/ },
  { name: "briefing", test: /\b(briefing|ou en est|ou en sommes|priorites?|resume de la situation)\b/ },
  { name: "juridique", test: /\b(loi|article|licence|autorisation|regime|droit|obligatoire|legal|agrement|homologation|concession|sanction|decret)\b/ },
];

const INBOX = /\b(boite (de reception|unifiee)|inbox|e-?mails? recus|messages? recus|courriels? recus|non lus?|repondre aux (messages|emails|clients))\b/;
const EXPLICIT_SEND = /\b(ecris a|ecrire a|envoie a|envoyer a|redige un (e-?mail|mail|courriel) a)\b|@/;

/**
 * Arbitrage entre intentions de modules qui se recouvrent (mode démo) : quand `when` correspond au message
 * normalisé, les intentions listées dans `skip` ne sont pas exécutées. Une ligne par règle.
 */
export const INTENT_ARBITRATION: { when: RegExp; skip: string[]; why: string }[] = [
  { when: /data ?room|salle de donnees|dossier investisseurs?\b/, skip: ["fund_financements"], why: "la data room (entreprise) l'emporte sur la recherche de financements" },
];

export function detectIntents(message: string): string[] {
  // « fournisseur d'accès (internet) » / « fournisseur de services » désignent une activité réglementée, pas un achat.
  const m = norm(message).replace(/fournisseurs? (d.acces|de services?)( a)?( internet)?/g, "activite reglementee");
  let found = INTENTS.filter((i) => i.test.test(m)).map((i) => i.name);
  // « mes emails reçus », « boîte de réception »… relèvent de la boîte unifiée (module mcp / comms) :
  // on n'y déclenche pas la rédaction d'email du cœur, sauf demande explicite d'écrire à quelqu'un.
  if (INBOX.test(m) && !EXPLICIT_SEND.test(m)) {
    found = found.filter((f) => f !== "email");
    if (!found.length) return [];
  }
  const ent = entrepriseIntentNames(m);
  if (ent.length && !(found = filterCoreIntents(ent, found)).length) return []; // module entreprise : pas d'action générique non demandée
  if (found.includes("relance")) return ["relance", ...found.filter((f) => f !== "relance" && f !== "devis" && f !== "email")];
  if (found.includes("devis")) return found.filter((f) => f !== "email");
  return found.length ? found : ["juridique"];
}

function extractEmails(message: string) {
  return [...message.matchAll(/[^\s@<>,;()]+@[^\s@<>,;()]+\.[a-z]{2,}/gi)].map((m) => m[0]);
}

function extractDate(message: string): string | undefined {
  const iso = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const fr = message.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  const rel = norm(message).match(/dans (\d{1,3}) jours?/);
  if (rel) {
    const d = new Date();
    d.setDate(d.getDate() + Number(rel[1]));
    return d.toISOString().slice(0, 10);
  }
  if (/\bdemain\b/.test(norm(message))) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

/** « Trouve des fournisseurs de motos … et demande des devis pour 10 motos, puis … » → « motos de livraison — 10 motos ». */
export function extractNeed(message: string): { search: string; need: string } {
  const stop = String.raw`(?=\s+(?:et|puis|ensuite|avant|afin)\b|[,.;!?]|$)`;
  const supplierPart = message.match(new RegExp(String.raw`(?:fournisseurs?|prestataires?)\s+(?:de|d['’]|pour|en)\s*(.+?)` + stop, "i"))?.[1]?.trim();
  const quotePart = message.match(new RegExp(String.raw`devis\s+(?:pour|de|d['’]|concernant)\s*(.+?)` + stop, "i"))?.[1]?.trim();
  const need = [supplierPart, quotePart].filter(Boolean).join(" — ") || message.trim();
  return { search: supplierPart || quotePart || message, need: need.slice(0, 200) };
}

/** « Envoie un mail à x@y.com pour demander un RDV » → « demander un RDV ». */
export function extractPurpose(message: string): string {
  const cleaned = message.replace(/[^\s@<>,;()]+@[^\s@<>,;()]+\.[a-z]{2,}/gi, "").replace(/\s+/g, " ").trim();
  const after = cleaned.match(/\b(?:pour|afin de|concernant|au sujet de)\s+(.+)$/i);
  const purpose = (after ? after[1] : cleaned.replace(/^(peux-tu |merci d['’]|stp )?(envoie|envoyer|écris|ecris|rédige|redige)( un)?( e-?mail| mail| courriel)?( à| a)?\s*/i, ""))
    .replace(/[.!?\s]+$/, "")
    .trim();
  return purpose || "prendre contact";
}

export async function runDemoPlanner(company: Company, message: string) {
  const ctx: ToolContext = { companyId: company.id, citations: [], groundings: [] };
  const trace: ToolTrace[] = [];
  const lines: string[] = [];
  const call = async (name: string, input: Record<string, unknown>) => {
    const tool = TOOL_MAP.get(name);
    if (!tool) {
      trace.push({ tool: name, input, summary: "Outil inconnu", ok: false });
      return null;
    }
    try {
      const r = await tool.run(input, ctx);
      trace.push({ tool: name, input, summary: r.summary, ok: true });
      return r;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur";
      trace.push({ tool: name, input, summary: `Erreur : ${msg}`, ok: false });
      lines.push(`⚠️ ${name} : ${msg}`);
      return null;
    }
  };

  // 1. Base juridique d'abord : recherche dans le corpus officiel sur la question, avant toute action.
  const legal = await call("rechercher_textes_juridiques", { question: message });
  const cov = (legal?.data as { couverture?: { statut: string; libelle: string } } | undefined)?.couverture;
  const official = ctx.citations.filter((c) => !c.isExample);
  const examples = ctx.citations.filter((c) => c.isExample);
  const intents = detectIntents(message);
  const legalOnly = intents.length === 1 && intents[0] === "juridique";
  if (!cov || cov.statut === "non_couvert" || !official.length) {
    lines.push(
      `**Base juridique : non couverte par le corpus officiel.** Je n'ai trouvé aucun texte officiel qui traite précisément cette question ; je n'affirme donc aucune règle. Faites vérifier ce point auprès d'un professionnel du droit ou de l'administration compétente.${examples.length ? `\n${examples.map((c) => `- ⚠️ Texte d'exemple, non officiel — ${c.title} : « ${c.excerpt.slice(0, 200)} » [${c.id}]`).join("\n")}` : ""}`,
    );
  } else {
    const shown = official.slice(0, legalOnly ? 3 : 2);
    lines.push(
      `**Base juridique : ${cov.libelle}.**${cov.statut === "partiel" ? " (couverture partielle : seuls certains aspects sont traités)" : ""} En mode démo, je cite les extraits sans les reformuler :\n${shown
        .map((c) => `- ${cite(c)} : « ${c.excerpt.slice(0, legalOnly ? 280 : 180).trim()}… » [${c.id}]`)
        .join("\n")}${examples.length ? `\n${examples.map((c) => `- ⚠️ Texte d'exemple, non officiel — ${c.title} : « ${c.excerpt.slice(0, 200)} » [${c.id}]`).join("\n")}` : ""}`,
    );
  }

  // 2. Actions, chacune avec son propre fondement juridique.
  for (const intent of intents) {
    switch (intent) {
      case "devis": {
        const { search, need } = extractNeed(message);
        const found = await call("lister_fournisseurs", { besoin: search });
        const list = (found?.data as { fournisseurs?: { id: string; nom: string }[] } | undefined)?.fournisseurs ?? [];
        const top = list.slice(0, 3);
        if (!top.length) {
          lines.push("Je n'ai trouvé aucun fournisseur correspondant dans l'annuaire.");
          break;
        }
        const r = await call("demander_devis", { fournisseur_ids: top.map((s) => s.id), besoin: need });
        if (r) lines.push(`**Fournisseurs contactés (après votre validation)** : ${top.map((s) => s.nom).join(", ")}. ${r.summary}. Validez-les dans l'onglet **Approbations** ; je suivrai les réponses et préparerai les relances.${basisLine(found?.data)}`);
        break;
      }
      case "relance": {
        const s = await call("suivre_devis", {});
        const ids = ((s?.data as { a_relancer?: string[] })?.a_relancer ?? []).slice(0, 3);
        if (!ids.length) lines.push("Aucune demande de devis envoyée en attente de réponse : rien à relancer.");
        for (const id of ids) {
          const r = await call("relancer_fournisseur", { devis_id: id });
          if (r) lines.push(`Relance préparée pour ${id} (en attente d'approbation).`);
        }
        break;
      }
      case "email": {
        const to = extractEmails(message);
        if (!to.length) {
          lines.push("Pour rédiger l'email, indiquez l'adresse du destinataire (ex. contact@exemple.com).");
          break;
        }
        const purpose = extractPurpose(message);
        const subject = `${company.name.replace(" (démo)", "")} — ${purpose.charAt(0).toUpperCase()}${purpose.slice(1, 70)}`;
        const body = `Bonjour,\n\nJe vous contacte au nom de ${company.name.replace(" (démo)", "")} (${company.sector}, ${company.city}) afin de ${purpose}.\n\nPourriez-vous nous indiquer vos disponibilités et les éléments éventuellement nécessaires ?\n\nJe reste disponible pour échanger à votre convenance.\n\nCordialement,\nL'équipe ${company.name.replace(" (démo)", "")}`;
        const r = await call("rediger_email", { destinataires: to, objet: subject, corps: body });
        if (r) lines.push(`✉️ Email à ${to.join(", ")} rédigé et placé dans la **file d'approbation**. Il partira uniquement après votre validation.`);
        break;
      }
      case "business_plan": {
        const r = await call("generer_business_plan", { notes: message });
        if (r) lines.push(`📄 ${r.summary}. Le document contient une section « Fondement juridique ». Complétez les hypothèses chiffrées dans l'onglet **Documents**.`);
        break;
      }
      case "roadmap": {
        const months = Number(norm(message).match(/(\d{1,2}) mois/)?.[1] ?? 6);
        const r = await call("generer_roadmap", { horizon_mois: months });
        if (r) lines.push(`🗺️ ${r.summary}.`);
        break;
      }
      case "document": {
        const m = norm(message);
        const type = /statuts/.test(m) ? "statuts" : /nda|confidentialite/.test(m) ? "nda" : /travail|embauche/.test(m) ? "contrat_travail" : /proces|pv/.test(m) ? "pv_ag" : "contrat_prestation";
        const r = await call("generer_document_juridique", { type });
        if (r) lines.push(`⚖️ ${r.summary}. Sources listées dans la section « Fondement juridique » du document ; faites-le relire par un professionnel avant signature.`);
        break;
      }
      case "checklist": {
        const r = await call("checklist_creation_entreprise", {});
        const steps = (r?.data as { ordre: number; titre: string; statut: string; fondement: Basis }[]) ?? [];
        const next = steps.find((s) => s.statut !== "fait");
        if (r)
          lines.push(
            `✅ **Étapes juridiques** — ${r.summary} :\n${steps
              .map((s) => `${s.ordre}. ${s.titre} (${s.statut.replace("_", " ")}) — ${s.fondement.statut === "non_couvert" ? "⚠️ non couvert par le corpus officiel" : s.fondement.libelle}`)
              .join("\n")}${next ? `\nProchaine étape : **${next.titre}**.` : ""}\n(Étapes génériques d'exemple : le fondement indiqué provient du corpus officiel ; « non couvert » signifie qu'aucun texte disponible ne la décrit.)`,
          );
        break;
      }
      case "conformite": {
        const r = await call("score_conformite", {});
        const recos = ((r?.data as { recommendations?: string[] })?.recommendations ?? []).slice(0, 3);
        if (r) lines.push(`📊 ${r.summary}.${recos.length ? `\n${recos.map((x) => `- ${x}`).join("\n")}` : ""}`);
        break;
      }
      case "calendrier": {
        const r = await call("calendrier_obligations", {});
        if (r) lines.push(`📅 ${r.summary}. Les échéances affichées sont des exemples à remplacer par les données officielles.`);
        break;
      }
      case "veille": {
        const r = await call("veille_reglementaire", {});
        const alerts = ((r?.data as { title: string }[]) ?? []).slice(0, 4);
        if (r) lines.push(`🔎 ${r.summary} :\n${alerts.map((a) => `- ${a.title}`).join("\n")}`);
        break;
      }
      case "tache": {
        const titre = message
          .replace(/^(rappelle[- ]moi de|n['’]oublie pas de|crée une tâche pour|cree une tache pour|ajoute une tâche\s*:?)\s*/i, "")
          .replace(/\s*(dans \d{1,3} jours?|demain|le \d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*/gi, " ")
          .trim();
        const r = await call("creer_tache", { titre: (titre.charAt(0).toUpperCase() + titre.slice(1)).slice(0, 120), echeance: extractDate(message) });
        if (r) lines.push(`📝 ${r.summary}.`);
        break;
      }
      case "briefing": {
        const r = await call("briefing_cofondateur", {});
        const d = r?.data as { approbations_en_attente: string[]; prochaines_demarches: string[]; recommandations: string[] } | undefined;
        if (d) lines.push(`☀️ ${r!.summary}\n- Approbations : ${d.approbations_en_attente.length ? d.approbations_en_attente.join(" ; ") : "aucune"}\n- Prochaines démarches : ${d.prochaines_demarches.join(" ; ") || "—"}\n${d.recommandations.map((x) => `- ${x}`).join("\n")}`);
        break;
      }
      case "juridique":
        // Déjà traité : la recherche juridique est toujours exécutée en premier.
        break;
    }
  }
  // 3. Intentions déclarées par les modules (registre lib/agent/registry.ts).
  const normalized = norm(message);
  const skipped = new Set(INTENT_ARBITRATION.filter((r) => r.when.test(normalized)).flatMap((r) => r.skip));
  for (const intent of DEMO_INTENTS) {
    if (skipped.has(intent.name) || !intent.test.test(normalized)) continue;
    try {
      const line = await intent.run({ company, message, call, ctx });
      if (line) lines.push(line);
    } catch (error) {
      lines.push(`⚠️ ${intent.name} : ${error instanceof Error ? error.message : "erreur"}`);
    }
  }

  return { answer: lines.join("\n\n"), toolTrace: trace, citations: ctx.citations, grounding: summarizeGrounding(ctx.groundings), mode: "demo" as const };
}
