import type { Company } from "@/lib/workspace/types";

/**
 * Intentions du planificateur démo (sans clé IA) pour le module « memoire ».
 * Elles sont exclusives : une transcription de réunion contient souvent « devis », « email »… qui ne doivent
 * pas déclencher d'actions externes.
 */
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function memoireIntents(message: string): string[] | null {
  const lines = message.split(/\r?\n/).filter((l) => l.trim()).length;
  const m = norm(message);
  if (/transcription\s*:/.test(m) || (lines >= 3 && /\breunion|\b\d{1,2}:\d{2}\b|^[a-z][a-z'-]+\s*:/m.test(m))) return ["reunion_analyse"];
  if (/ce que j.ai (manque|rate)|j.ai (manque|rate) quoi|quoi de neuf depuis/.test(m)) return ["manque"];
  if (/\b(pv|proces-verbal|proces verbal|compte-rendu|compte rendu)\b/.test(m) && /\breunion/.test(m)) return ["pv"];
  if (/enregistre(r|z)? (la |une |cette |notre )?decision|consigne(r|z)? (la |une |cette )?decision|note(r|z)? (la |une |cette )?decision/.test(m)) return ["decision"];
  if (/registre des decisions|liste des decisions|nos decisions|decisions prises/.test(m)) return ["registre"];
  if (/score co-?founder|score de credibilite|credibilite|track record/.test(m) || (/\bscore\b/.test(m) && /attestation|signe|verifiable|qr/.test(m)))
    return /attestation|signe|certifi|verifiable|qr|investisseur|partenaire/.test(m) ? ["score_attester"] : ["score_cofounder"];
  if (/resume vocal|en bref|version courte|bas debit|lis-moi|lecture vocale/.test(m)) return ["resume_vocal"];
  if (/pourquoi (avons|a-t-on|on a|nous avons|avions|avoir)|memoire|historique|qu.avons-nous decide|qu.a-t-on decide|qui a decide|quand avons-nous/.test(m)) return ["memoire"];
  if (/\breunions?\b/.test(m)) return ["reunions"];
  return null;
}

type Call = (name: string, input: Record<string, unknown>) => Promise<{ summary: string; data: unknown } | null>;

/** Exécute une intention du module ; renvoie false si l'intention n'appartient pas au module. */
export async function runMemoireIntent(intent: string, ctx: { company: Company; message: string; call: Call; lines: string[] }): Promise<boolean> {
  const { message, call, lines } = ctx;
  switch (intent) {
    case "memoire": {
      const r = await call("memoire_interroger", { question: message });
      const d = r?.data as { reponse_extractive?: string } | undefined;
      if (r) lines.push(`🧠 **Mémoire de l'entreprise** — ${r.summary}.\n\n${d?.reponse_extractive ?? ""}`);
      return true;
    }
    case "registre": {
      const r = await call("registre_decisions", {});
      const list = (r?.data as { titre: string; statut: string; date: string; fondement: string }[]) ?? [];
      if (r) lines.push(`📚 **Registre des décisions** — ${r.summary} :\n${list.map((x) => `- ${x.date} · ${x.titre} (${x.statut}) — ${x.fondement}`).join("\n")}`);
      return true;
    }
    case "decision": {
      const body = message.replace(/^.*?decision\s*:?\s*/i, "").replace(/^.*?décision\s*:?\s*/i, "").trim() || message;
      const [titre, raisons] = body.split(/\s+(?:car|parce que|parce qu['’])\s+/i);
      const r = await call("enregistrer_decision", { titre: titre.slice(0, 160), decision: titre, raisons: raisons ?? "" });
      if (r) lines.push(`📝 ${r.summary}. Retrouvez-la dans l'onglet **Mémoire & décisions**.`);
      return true;
    }
    case "reunion_analyse": {
      const transcript = message.replace(/^[\s\S]*?transcription\s*:\s*/i, "").trim();
      const titre = message.match(/r[ée]union\s+(?:de |du |d['’]|sur )?([^\n:]{3,60})/i)?.[1]?.trim() ?? `Réunion du ${new Date().toISOString().slice(0, 10)}`;
      const r = await call("reunion_analyser", { titre, transcription: transcript });
      const d = r?.data as { resume: string; decisions: string[]; taches: { titre: string; responsable: string; echeance: string | null }[] } | undefined;
      if (r && d)
        lines.push(
          `🎙️ **${r.summary}**\n${d.resume}\n${d.decisions.length ? `\nDécisions (ajoutées au registre) :\n${d.decisions.map((x) => `- ${x}`).join("\n")}` : ""}${d.taches.length ? `\nTâches créées :\n${d.taches.map((t) => `- ${t.titre} → ${t.responsable}${t.echeance ? ` (échéance ${t.echeance})` : ""}`).join("\n")}` : ""}\n\nLe PV est exportable depuis l'onglet **Salle de réunion**.`,
        );
      return true;
    }
    case "reunions": {
      const r = await call("reunion_lister", {});
      const list = (r?.data as { titre: string; date: string; statut: string; decisions: number; taches: number }[]) ?? [];
      if (r) lines.push(`🗓️ ${r.summary} :\n${list.map((x) => `- ${x.date} · ${x.titre} (${x.statut}) — ${x.decisions} décision(s), ${x.taches} tâche(s)`).join("\n") || "Aucune réunion."}`);
      return true;
    }
    case "manque": {
      const r = await call("reunion_ce_que_jai_manque", {});
      const d = r?.data as { decisions: string[]; actions: { title: string; assignee?: string }[] } | undefined;
      if (r && d) lines.push(`⏪ **Ce que vous avez manqué** — ${r.summary}${d.decisions.length ? `\n- Décisions : ${d.decisions.join(" ; ")}` : ""}${d.actions.length ? `\n- Tâches : ${d.actions.map((a) => `${a.title}${a.assignee ? ` (${a.assignee})` : ""}`).join(" ; ")}` : ""}`);
      return true;
    }
    case "pv": {
      const list = await call("reunion_lister", {});
      const last = ((list?.data as { id: string; statut: string }[]) ?? []).find((x) => x.statut === "terminee");
      if (!last) {
        lines.push("Aucune réunion analysée : collez d'abord la transcription ou utilisez l'onglet **Salle de réunion**.");
        return true;
      }
      const r = await call("reunion_generer_pv", { reunion_id: last.id });
      const d = r?.data as { export_markdown: string } | undefined;
      if (r) lines.push(`📄 ${r.summary}. Export : ${d?.export_markdown}`);
      return true;
    }
    case "score_cofounder": {
      const r = await call("score_cofounder", {});
      const comps = ((r?.data as { components?: { label: string; score: number | null; explanation: string }[] })?.components ?? []);
      if (r) lines.push(`🏅 **${r.summary}**\n${comps.map((c) => `- ${c.label} : ${c.score === null ? "pas encore de données" : `${c.score}/100`} — ${c.explanation}`).join("\n")}\nMéthodologie détaillée dans l'onglet **Score Co-founder**.`);
      return true;
    }
    case "score_attester": {
      const r = await call("score_cofounder_attester", {});
      const d = r?.data as { attestationId: string; url_verification: string; demo: boolean } | undefined;
      if (r && d) lines.push(`🔏 ${r.summary}. Lien public : ${d.url_verification}${d.demo ? "\n⚠️ Attestation de démonstration (entreprise de démo ou clé de développement)." : ""}`);
      return true;
    }
    case "resume_vocal": {
      const r = await call("resume_vocal", {});
      const d = r?.data as { texte: string } | undefined;
      if (d) lines.push(`🔊 ${d.texte}`);
      return true;
    }
    default:
      return false;
  }
}
