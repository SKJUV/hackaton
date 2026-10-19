import { legalBasis, type AgentTool, type ToolContext } from "@/lib/agent/tools";
import { currentScore, issueAttestation } from "./attestations";
import { basisData, snapshotLines, toSnapshot } from "./legal";
import { liteBriefing } from "./lite";
import { listMeetings, recordMeeting, savePvDocument, whatIMissed } from "./meetings";
import { askMemory, listDecisions, recordDecision, STATUS_LABEL } from "./memory";
import { LEVEL_LABEL, METHODOLOGY } from "./score";
import { assertMemoireInCompany } from "./store";
import type { DecisionStatus } from "./types";

/**
 * Outils d'agent du module « memoire ». Exposés aux modèles (Groq/OpenAI/Gemini) ET au planificateur démo
 * via le registre des modules (lib/agent/registry.ts, voir ./agent.ts).
 */
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean) : []);
const verifyUrl = (id: string) => `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/verifier/${id}`;

export const MEMOIRE_TOOLS: AgentTool[] = [
  {
    name: "memoire_interroger",
    description:
      "Interroge la MÉMOIRE ORGANISATIONNELLE de l'entreprise (décisions, documents, emails, réunions, journal d'audit, conversations). À utiliser pour « Pourquoi avons-nous choisi… ? », « Qu'avons-nous décidé sur… ? », « Quand… ? ». Renvoie des éléments numérotés [M1]… avec liens et, pour chaque décision, les articles de loi consultés AU MOMENT de la décision. Cite [Mx] et ne réponds qu'avec ce qui est consigné.",
    parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
    async run(input, ctx) {
      const r = await askMemory(ctx.companyId, str(input.question), { llm: false });
      return {
        summary: `${r.hits.length} élément(s) de mémoire, ${r.decisions.length} décision(s) liée(s)`,
        data: {
          reponse_extractive: r.answer,
          elements: r.hits.map((h) => ({ id: h.id, type: h.ref.type, ref: h.ref.id, libelle: h.ref.label, date: h.date.slice(0, 10), extrait: h.excerpt, exemple: h.isExample ?? false })),
          decisions: r.decisions.map((d) => ({ id: d.id, titre: d.title, statut: d.status, date: d.decidedAt.slice(0, 10), par: d.decidedBy, raisons: d.rationale, alternatives: d.alternatives, sources: d.sources.map((s) => s.label), textes_au_moment_de_la_decision: snapshotLines(d.legal), statut_juridique: d.legal.status })),
        },
      };
    },
  },
  {
    name: "memoire_registre_decisions",
    description: "Liste le registre des décisions de l'entreprise (filtre optionnel par statut proposee/adoptee/revisee/abandonnee ou par mots-clés), avec leur fondement juridique figé.",
    parameters: { type: "object", properties: { statut: { type: "string", enum: ["proposee", "adoptee", "revisee", "abandonnee"] }, recherche: { type: "string" } } },
    async run(input, ctx) {
      const list = await listDecisions(ctx.companyId, { status: str(input.statut) || undefined, q: str(input.recherche) || undefined });
      return {
        summary: `${list.length} décision(s) au registre`,
        data: list.slice(0, 20).map((d) => ({ id: d.id, titre: d.title, statut: STATUS_LABEL[d.status], date: d.decidedAt.slice(0, 10), par: d.decidedBy, raisons: d.rationale, fondement: d.legal.label, exemple: d.isExample ?? false })),
      };
    },
  },
  {
    name: "memoire_enregistrer_decision",
    description: "Enregistre une décision au registre (titre, décision, raisons, alternatives écartées). La recherche juridique est faite au moment de l'enregistrement et les articles trouvés sont figés avec la décision.",
    parameters: {
      type: "object",
      properties: {
        titre: { type: "string" },
        decision: { type: "string" },
        raisons: { type: "string" },
        alternatives: { type: "array", items: { type: "string" } },
        statut: { type: "string", enum: ["proposee", "adoptee", "revisee", "abandonnee"] },
      },
      required: ["titre", "decision"],
    },
    async run(input, ctx) {
      const titre = str(input.titre);
      const decision = str(input.decision) || titre;
      const g = await legalBasis(ctx, `${titre} ${decision}`.slice(0, 300), 3);
      const status = (["proposee", "adoptee", "revisee", "abandonnee"].includes(str(input.statut)) ? str(input.statut) : "adoptee") as DecisionStatus;
      const d = await recordDecision(ctx.companyId, { title: titre, decision, rationale: str(input.raisons), alternatives: strArr(input.alternatives), status, decidedBy: "agent (à la demande de l'utilisateur)" }, "agent", toSnapshot(g));
      return { summary: `Décision « ${d.title} » enregistrée (${STATUS_LABEL[d.status]}) — ${g.label}`, data: { decisionId: d.id, fondement_juridique: basisData(g) } };
    },
  },
  {
    name: "memoire_reunion_analyser",
    description:
      "Salle de réunion : analyse une transcription (texte ou audio déjà transcrit), produit le résumé, les décisions (ajoutées au registre avec leur fondement juridique) et crée automatiquement les tâches assignées aux membres cités, avec échéances.",
    parameters: {
      type: "object",
      properties: { titre: { type: "string" }, transcription: { type: "string", description: "Texte de la réunion, idéalement « [mm:ss] Nom : propos » par ligne" }, participants: { type: "array", items: { type: "string" } } },
      required: ["titre", "transcription"],
    },
    async run(input, ctx) {
      const r = await recordMeeting(ctx.companyId, { title: str(input.titre) || "Réunion", transcript: str(input.transcription), participants: strArr(input.participants), source: "texte" }, "agent");
      const a = r.analysis;
      return {
        summary: `Réunion analysée (${a.mode === "llm" ? "IA" : "démo"}) : ${a.decisions.length} décision(s), ${a.actions.length} tâche(s) créée(s)`,
        data: { reunionId: r.meeting.id, resume: a.summary, points_cles: a.keyPoints, decisions: a.decisions.map((d) => d.title), taches: a.actions.map((x) => ({ titre: x.title, responsable: x.assigneeName ?? "à désigner", echeance: x.dueDate ?? null, tacheId: x.taskId })) },
      };
    },
  },
  {
    name: "memoire_reunion_lister",
    description: "Liste les réunions de l'entreprise (titre, date, statut, nombre de décisions et de tâches).",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const list = await listMeetings(ctx.companyId);
      return { summary: `${list.length} réunion(s)`, data: list.map((r) => ({ id: r.id, titre: r.title, date: r.date.slice(0, 10), statut: r.status, decisions: r.decisionIds.length, taches: r.taskIds.length, resume: r.analysis?.summary, exemple: r.isExample ?? false })) };
    },
  },
  {
    name: "memoire_ce_que_jai_manque",
    description:
      "« Ce que j'ai manqué » : avec reunion_id, résume ce qui a été dit avant l'arrivée du membre (depuis = horodatage mm:ss, numéro de ligne ou pourcentage) ; sans reunion_id, résume ce qui s'est passé dans l'entreprise depuis une date (AAAA-MM-JJ, défaut : 7 jours).",
    parameters: { type: "object", properties: { reunion_id: { type: "string" }, depuis: { type: "string" } } },
    async run(input, ctx) {
      const id = str(input.reunion_id);
      if (id) await assertMemoireInCompany("meetings", id, ctx.companyId);
      const r = await whatIMissed(ctx.companyId, { meetingId: id || undefined, since: str(input.depuis) || undefined });
      return { summary: r.summary, data: r };
    },
  },
  {
    name: "memoire_reunion_pv",
    description: "Génère le procès-verbal (PV) d'une réunion analysée, l'enregistre dans Documents (à faire approuver) et renvoie le lien d'export Markdown/HTML imprimable.",
    parameters: { type: "object", properties: { reunion_id: { type: "string" } }, required: ["reunion_id"] },
    async run(input, ctx) {
      const id = str(input.reunion_id);
      await assertMemoireInCompany("meetings", id, ctx.companyId);
      const doc = await savePvDocument(id, "agent");
      return { summary: `PV « ${doc.title} » enregistré dans Documents`, data: { documentId: doc.id, export_markdown: `/api/memoire/meetings/${id}/pv?format=md`, export_imprimable: `/api/memoire/meetings/${id}/pv?format=html` } };
    },
  },
  {
    name: "memoire_score",
    description: "Calcule le Score Co-founder (crédibilité 0–100) à partir du journal : délais tenus, engagements respectés, objectifs atteints, décisions documentées. Renvoie le détail par critère et la méthodologie.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx: ToolContext) {
      const s = await currentScore(ctx.companyId);
      return { summary: `Score Co-founder : ${s.score}/100 (${LEVEL_LABEL[s.level]})`, data: { ...s, methodologie: METHODOLOGY } };
    },
  },
  {
    name: "memoire_score_attester",
    description: "Émet une attestation du Score Co-founder signée en Ed25519, vérifiable publiquement sur /verifier/<id> (QR code). À utiliser quand l'utilisateur veut présenter son score à un investisseur ou partenaire.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const att = await issueAttestation(ctx.companyId, "agent");
      return {
        summary: `Attestation signée : ${att.payload.score}/100 — vérifiable sur /verifier/${att.id}`,
        data: { attestationId: att.id, url_verification: verifyUrl(att.id), score: att.payload.score, cle: att.payload.keyId, demo: att.payload.demo, expire_le: att.payload.expiresAt.slice(0, 10) },
      };
    },
  },
  {
    name: "memoire_resume_vocal",
    description: "Mode bas débit / vocal : renvoie en 3 phrases maximum la situation de l'entreprise (tâches, retards, approbations, dernière décision, score), prête à être lue à voix haute.",
    parameters: { type: "object", properties: {} },
    async run(_i, ctx) {
      const text = await liteBriefing(ctx.companyId);
      return { summary: "Résumé vocal prêt", data: { texte: text } };
    },
  },
];
