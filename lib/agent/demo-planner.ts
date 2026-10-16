import type { Company, ToolTrace } from "@/lib/workspace/types";
import { TOOL_MAP, type ToolContext } from "./tools";

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

export function detectIntents(message: string): string[] {
  const m = norm(message);
  const found = INTENTS.filter((i) => i.test.test(m)).map((i) => i.name);
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

export async function runDemoPlanner(company: Company, message: string) {
  const ctx: ToolContext = { companyId: company.id, citations: [] };
  const trace: ToolTrace[] = [];
  const lines: string[] = [];
  const call = async (name: string, input: Record<string, unknown>) => {
    const tool = TOOL_MAP.get(name)!;
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

  for (const intent of detectIntents(message)) {
    switch (intent) {
      case "devis": {
        const found = await call("lister_fournisseurs", { besoin: message });
        const list = (found?.data as { id: string; nom: string }[] | undefined) ?? [];
        const top = list.slice(0, 3);
        if (!top.length) {
          lines.push("Je n'ai trouvé aucun fournisseur correspondant dans l'annuaire.");
          break;
        }
        const need = message.replace(/^(peux-tu|pourrais-tu|merci de)\s+/i, "").slice(0, 200);
        const r = await call("demander_devis", { fournisseur_ids: top.map((s) => s.id), besoin: need });
        if (r) lines.push(`**Fournisseurs contactés (après votre validation)** : ${top.map((s) => s.nom).join(", ")}. ${r.summary}. Validez-les dans l'onglet **Approbations** ; je suivrai les réponses et préparerai les relances.`);
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
        const subject = `${company.name.replace(" (démo)", "")} — ${message.replace(/[^\p{L}\p{N}\s'’-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60)}`;
        const body = `Bonjour,\n\n${message.trim()}\n\nJe reste disponible pour échanger à votre convenance.\n\nCordialement,\nL'équipe ${company.name.replace(" (démo)", "")}`;
        const r = await call("rediger_email", { destinataires: to, objet: subject, corps: body });
        if (r) lines.push(`✉️ Email à ${to.join(", ")} rédigé et placé dans la **file d'approbation**. Il partira uniquement après votre validation.`);
        break;
      }
      case "business_plan": {
        const r = await call("generer_business_plan", { notes: message });
        if (r) lines.push(`📄 ${r.summary}. Complétez les hypothèses chiffrées dans l'onglet **Documents**.`);
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
        if (r) lines.push(`⚖️ ${r.summary}. Faites-la relire par un professionnel avant signature.`);
        break;
      }
      case "checklist": {
        const r = await call("checklist_creation_entreprise", {});
        const steps = (r?.data as { titre: string; statut: string }[]) ?? [];
        const next = steps.find((s) => s.statut !== "fait");
        if (r) lines.push(`✅ ${r.summary}.${next ? ` Prochaine étape : **${next.titre}**.` : ""} (Étapes génériques d'exemple, à confirmer avec le corpus officiel.)`);
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
        const r = await call("creer_tache", { titre: message.replace(/^(rappelle-moi de|rappelle moi de|n'oublie pas de|crée une tâche pour)\s*/i, "").slice(0, 120), echeance: extractDate(message) });
        if (r) lines.push(`📝 ${r.summary}.`);
        break;
      }
      case "briefing": {
        const r = await call("briefing_cofondateur", {});
        const d = r?.data as { approbations_en_attente: string[]; prochaines_demarches: string[]; recommandations: string[] } | undefined;
        if (d) lines.push(`☀️ ${r!.summary}\n- Approbations : ${d.approbations_en_attente.length ? d.approbations_en_attente.join(" ; ") : "aucune"}\n- Prochaines démarches : ${d.prochaines_demarches.join(" ; ") || "—"}\n${d.recommandations.map((x) => `- ${x}`).join("\n")}`);
        break;
      }
      case "juridique": {
        const r = await call("rechercher_textes_juridiques", { question: message });
        if (!ctx.citations.length) {
          lines.push("Je n'ai trouvé aucun passage pertinent dans le corpus indexé.");
          break;
        }
        const official = ctx.citations.filter((c) => !c.isExample);
        const examples = ctx.citations.filter((c) => c.isExample);
        lines.push(
          `**Passages trouvés dans le corpus** (${r?.summary}). En mode démo, je cite les extraits sans les reformuler :\n${official
            .slice(0, 3)
            .map((c) => `- ${c.legalTitle ?? c.title}, page ${c.page}${c.articles.length ? `, art. ${c.articles.slice(0, 3).join(", ")}` : ""} : « ${c.excerpt.slice(0, 280).trim()}… » [${c.id}]`)
            .join("\n")}${examples.length ? `\n${examples.map((c) => `- ⚠️ Texte d'exemple, non officiel — ${c.title} : « ${c.excerpt.slice(0, 200)} » [${c.id}]`).join("\n")}` : ""}`,
        );
        break;
      }
    }
  }
  return { answer: lines.join("\n\n"), toolTrace: trace, citations: ctx.citations, mode: "demo" as const };
}
