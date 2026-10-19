/**
 * Mode démo (sans clé IA) : intentions des modules Idée / Financements / Équipe / Mentors / Marché B2B.
 * Elles appellent les MÊMES outils que l'agent LLM (via `call`, tracé) — branchées par le registre (lib/agent/registry.ts).
 */
import type { DemoCall, DemoIntent } from "@/lib/agent/registry";
import { norm } from "./util";

type Call = DemoCall;
export type EntrepreneurIntent = "idee" | "financement" | "equipe" | "mentor" | "b2b";

export const INTENTS: { name: EntrepreneurIntent; test: RegExp }[] = [
  { name: "idee", test: /\b(mon idee|l.idee|idee de|viabilite|diagnostic|concurrents?|pivots?|valider mon (projet|idee)|analyse (de )?(mon )?(projet|marche))\b/ },
  { name: "financement", test: /\b(financements?|financer|subventions?|investisseurs?|levee de fonds|lever des fonds|accelerateurs?|incubat\w*|credits? cloud|concours|bourses? d.amorcage)\b/ },
  { name: "equipe", test: /\b(recrut\w*|co-?fondateurs?|associes? manquants?|competences manquantes|fiche de poste|candidat\w*|cv|embaucher|equipe ideale)\b/ },
  { name: "mentor", test: /\b(mentors?|mentorat|parrain\w*)\b/ },
  { name: "b2b", test: /\b(b2b|place de marche|marketplace|partenaires? (commerciaux|b2b|fiables?)|solidite)\b/ },
];

export function detectEntrepreneurIntents(message: string): string[] {
  const m = norm(message);
  return INTENTS.filter((i) => i.test.test(m)).map((i) => i.name);
}

type Prog = { id: string; nom: string; verdict: string; exemple: boolean; source?: string; verifie_le?: string; calendrier: string };

/** Exécute une intention et renvoie le paragraphe Markdown (ou null). */
export async function runEntrepreneurIntent(intent: EntrepreneurIntent, message: string, call: Call): Promise<string | null> {
  const m = norm(message);
  const lines: string[] = [];
  {
    switch (intent) {
      case "idee": {
        const r = await call("idea_analyser", { idee: message.length > 80 ? message : "", enregistrer_document: /enregistr|document|sauvegard/.test(m) });
        const d = r?.data as { verdictLabel: string; weaknesses: string[]; strengths: string[]; obstacles: { theme: string; status: string; articles: { source: string; document: string; page: number; article: string }[] }[]; pivots: string[]; competitorsMode: string } | undefined;
        if (!d) break;
        const obs = d.obstacles.map((o) => `- ${o.theme} : ${o.status === "non_couvert" ? "⚠️ non couvert par le corpus officiel" : o.articles.slice(0, 3).map((a) => `${a.document}, p. ${a.page}${a.article !== "—" ? `, art. ${a.article}` : ""} [${a.source}]`).join(" ; ")}`);
        lines.push(`🔍 **Diagnostic honnête de l'idée** — ${d.verdictLabel}\n**Faiblesses** :\n${d.weaknesses.map((w) => `- ${w}`).join("\n")}\n**Forces** :\n${d.strengths.map((w) => `- ${w}`).join("\n") || "- aucune force démontrée à ce stade"}\n**Obstacles réglementaires (article par article)** :\n${obs.join("\n")}\n**Pivots possibles** :\n${d.pivots.map((p) => `- ${p}`).join("\n")}${d.competitorsMode === "demo" ? "\n_Concurrents : catégories génériques (recherche web non configurée)._" : ""}\nDétail complet dans l'onglet **Idée (diagnostic)** (niveau Entrepreneur).`);
        break;
      }
      case "financement": {
        const r = await call("fund_evaluer_eligibilite", {});
        const d = r?.data as { programmes: Prog[]; profil_manquant: string[] } | undefined;
        if (!d) break;
        const real = d.programmes.filter((p) => !p.exemple);
        const show = (p: Prog) => `- ${p.nom} — **${p.verdict === "eligible" ? "éligible" : p.verdict === "non_eligible" ? "non éligible" : "à vérifier"}** · ${p.calendrier} (source vérifiée le ${p.verifie_le} : ${p.source})`;
        lines.push(`💰 **Financements** — ${r!.summary}\n${real.slice(0, 5).map(show).join("\n")}${d.profil_manquant.length ? `\nComplétez le profil (${d.profil_manquant.join(", ")}) pour lever les « à vérifier ».` : ""}\nLes programmes marqués « Exemple » dans l'onglet sont fictifs.`);
        if (/\b(dossier|candidature|postuler|candidater)\b/.test(m)) {
          const best = real.find((p) => p.verdict === "eligible") ?? real.find((p) => p.verdict === "a_verifier");
          if (best) {
            const prep = await call("fund_preparer_dossier", { programme_id: best.id });
            if (prep) lines.push(`📄 ${prep.summary}. À compléter dans **Documents** avant toute soumission.`);
          }
        }
        if (/\brelan/.test(m)) {
          const s = await call("fund_suivre_candidatures", {});
          const due = ((s?.data as { id: string; status: string; contactEmail?: string }[]) ?? []).filter((a) => ["soumise", "en_attente_reponse"].includes(a.status) && a.contactEmail);
          for (const a of due.slice(0, 2)) {
            const f = await call("fund_relancer_programme", { candidature_id: a.id });
            if (f) lines.push(`✉️ ${f.summary} (onglet **Approbations**).`);
          }
          if (!due.length) lines.push("Aucune candidature soumise avec un contact connu à relancer.");
        }
        break;
      }
      case "equipe": {
        const r = await call("team_analyser_competences", {});
        const d = r?.data as { gaps: { label: string; critical: boolean }[]; profiles: { title: string; kind: string }[] } | undefined;
        if (d) lines.push(`👥 **Équipe** — ${r!.summary}\n${d.profiles.map((p) => `- ${p.title} (${p.kind})`).join("\n") || "- Aucune compétence critique manquante déclarée."}`);
        if (/fiche de poste|rediger|offre d.emploi/.test(m)) {
          const f = await call("team_rediger_fiche_de_poste", {});
          if (f) lines.push(`📝 ${f.summary}.`);
        }
        if (/candidat|cv|filtr|tri/.test(m)) {
          const f = await call("team_filtrer_candidatures", {});
          const fd = f?.data as { alertes_biais: { message: string }[] } | undefined;
          if (f) lines.push(`🎯 ${f.summary}.${fd?.alertes_biais.length ? `\n${fd.alertes_biais.map((a) => `- ⚠️ ${a.message}`).join("\n")}` : ""}`);
        }
        const c = await call("team_conformite_recrutement", {});
        if (c) lines.push(`⚖️ Conformité du recrutement : ${c.summary}.`);
        break;
      }
      case "mentor": {
        const r = await call("mentor_rechercher", {});
        const ms = ((r?.data as { mentors: { id: string; nom: string; titre: string; score: number }[] })?.mentors ?? []).slice(0, 3);
        if (r) lines.push(`🤝 **Mentors** (profils d'exemple) — ${r.summary}\n${ms.map((x) => `- ${x.nom} — ${x.titre} (${x.score}/100)`).join("\n")}`);
        if (/mise en relation|mettre en relation|contacte|presente/.test(m) && ms[0]) {
          const q = await call("mentor_demander_mise_en_relation", { mentor_id: ms[0].id });
          if (q) lines.push(`✉️ ${q.summary} (onglet **Approbations**).`);
        }
        break;
      }
      case "b2b": {
        const need = message.replace(/^.*?\b(pour|de|en)\b/i, "").slice(0, 120);
        const r = await call("market_rechercher_partenaires", { besoin: need });
        const ps = ((r?.data as { partenaires: { nom: string; compatibilite: number; solidite: number }[] })?.partenaires ?? []).slice(0, 4);
        if (r) lines.push(`🏪 **Marché B2B** — ${r.summary}\n${ps.map((p) => `- ${p.nom} : compatibilité ${p.compatibilite}/100, solidité ${p.solidite}/100 (exemple)`).join("\n")}`);
        break;
      }
    }
  }
  return lines.length ? lines.join("\n\n") : null;
}

/** Intentions du mode démo pour un module donné (format du registre). */
export function demoIntentsFor(intent: EntrepreneurIntent, label: string): DemoIntent[] {
  const def = INTENTS.find((i) => i.name === intent)!;
  return [{ name: label, test: def.test, run: ({ message, call }) => runEntrepreneurIntent(intent, message, call) }];
}
