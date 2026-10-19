import type { AgentModule, AgentTool } from "@/lib/agent/registry";
import { legalBasis } from "@/lib/agent/tools";
import { readData } from "@/lib/workspace/store";
import { FORM_MAP, isFormId, type FormId } from "./catalog";
import { chooseStructure, generatePacte, recommendStructure, registrationGuide, simulateCreation, type Questionnaire } from "./service";

const formParam = { type: "string", enum: [...FORM_MAP.keys()], description: "Forme juridique (EI, SARL, SARLU, SAS, SASU, SA, GIE, SNC)" };
const toForm = (v: unknown, fallback: FormId = "SARL"): FormId => (isFormId(String(v ?? "").toUpperCase()) ? (String(v).toUpperCase() as FormId) : fallback);

async function defaults(companyId: string) {
  const data = await readData();
  const company = data.companies.find((c) => c.id === companyId);
  const members = data.members.filter((m) => m.companyId === companyId && m.role !== "lecteur");
  return { company, members };
}

const tools: AgentTool[] = [
  {
    name: "structure_recommander",
    description: "Choix guidé de la forme juridique (EI, SARL, SAS…) à partir d'un questionnaire ; renvoie un classement motivé, le fondement juridique trouvé dans le corpus et les points non couverts.",
    parameters: {
      type: "object",
      properties: {
        fondateurs: { type: "number" }, investisseurs: { type: "boolean" }, responsabilite_limitee: { type: "boolean" },
        budget: { type: "string", enum: ["faible", "moyen", "eleve"] }, flexibilite: { type: "boolean" }, mutualiser: { type: "boolean" },
      },
    },
    async run(input, ctx) {
      const { members } = await defaults(ctx.companyId);
      const q: Questionnaire = {
        founders: Number(input.fondateurs) || Math.max(1, members.length),
        wantsInvestors: input.investisseurs !== false,
        limitedLiability: input.responsabilite_limitee !== false,
        budget: (["faible", "moyen", "eleve"].includes(String(input.budget)) ? input.budget : "moyen") as Questionnaire["budget"],
        wantsFlexibility: input.flexibilite !== false,
        pooling: input.mutualiser === true,
      };
      const r = await recommendStructure(ctx.companyId, q, "agent");
      const best = r.top[0];
      const g = best ? await legalBasis(ctx, FORM_MAP.get(best.form)!.legalQuery, 3) : undefined;
      return {
        summary: `Recommandation : ${r.top.map((t) => t.form).join(" > ")}`,
        data: { top: r.top.map((t) => ({ forme: t.form, nom: t.name, score: t.score, raisons: t.reasons, vigilance: t.cautions })), avertissement: r.notice, fondement_juridique: g && { statut: g.status, libelle: g.label } },
      };
    },
  },
  {
    name: "structure_choisir",
    description: "Enregistre la forme juridique retenue par les fondateurs (décision mémorisée et tracée).",
    parameters: { type: "object", properties: { forme: formParam, motif: { type: "string" } }, required: ["forme"] },
    async run(input, ctx) {
      const r = await chooseStructure(ctx.companyId, toForm(input.forme), "agent", input.motif ? String(input.motif) : undefined);
      return { summary: `Forme juridique retenue : ${r.form}`, data: r };
    },
  },
  {
    name: "structure_simuler_creation",
    description: "Simulateur de création : compare 2 à 4 formes juridiques (obligations sourcées dans le corpus, coûts et délais d'EXEMPLE).",
    parameters: { type: "object", properties: { formes: { type: "array", items: formParam } } },
    async run(input, ctx) {
      const forms = Array.isArray(input.formes) && input.formes.length ? input.formes.map((f) => toForm(f)) : (["SARL", "SAS"] as FormId[]);
      const r = await simulateCreation(ctx.companyId, forms);
      return {
        summary: `Simulation ${forms.join(" vs ")}`,
        data: r.columns.map((c) => ({ forme: c.form, cout_exemple_fcfa: c.exampleCostFcfa, delai_exemple_jours: c.exampleDelayDays, obligations: c.rows.map((x) => ({ categorie: x.label, base: x.basis.label })) })),
      };
    },
  },
  {
    name: "structure_generer_pacte",
    description: "Génère un pacte d'associés avec vesting (cliff, acquisition linéaire, good/bad leaver, préemption, lock-up, drag/tag-along), enregistré dans Documents et à faire relire.",
    parameters: {
      type: "object",
      properties: {
        associes: { type: "array", items: { type: "object", properties: { nom: { type: "string" }, pourcentage: { type: "number" }, role: { type: "string" } } } },
        duree_mois: { type: "number" }, cliff_mois: { type: "number" },
      },
    },
    async run(input, ctx) {
      const { members } = await defaults(ctx.companyId);
      let associates = Array.isArray(input.associes)
        ? (input.associes as { nom?: string; pourcentage?: number; role?: string }[]).map((a) => ({ name: String(a.nom ?? ""), percent: Number(a.pourcentage), role: a.role }))
        : [];
      if (associates.length < 2) {
        const pool = members.slice(0, 4);
        if (pool.length < 2) throw new Error("Indiquez au moins deux associés (nom et pourcentage).");
        const share = Math.floor((100 / pool.length) * 100) / 100;
        associates = pool.map((m, i) => ({ name: m.name, role: m.role, percent: i === 0 ? Math.round((100 - share * (pool.length - 1)) * 100) / 100 : share }));
      }
      const r = await generatePacte(ctx.companyId, { associates, vestingMonths: Number(input.duree_mois) || 48, cliffMonths: input.cliff_mois === undefined ? 12 : Number(input.cliff_mois) }, "agent");
      await legalBasis(ctx, r.basis.query, 3);
      return { summary: `Pacte d'associés « ${r.document.title} » enregistré (à relire)`, data: { documentId: r.document.id, calendrier: r.schedule, fondement_juridique: { statut: r.basis.status, libelle: r.basis.label } } };
    },
  },
  {
    name: "structure_guide_immatriculation",
    description: "Guide d'immatriculation pas à pas pour une forme juridique (étapes d'exemple, chacune rattachée au corpus), avec création optionnelle des tâches.",
    parameters: { type: "object", properties: { forme: formParam, creer_taches: { type: "boolean" } } },
    async run(input, ctx) {
      const { company } = await defaults(ctx.companyId);
      const fallback = isFormId(company?.legalForm) ? (company!.legalForm as FormId) : "SARL";
      const r = await registrationGuide(ctx.companyId, toForm(input.forme, fallback), { createTasks: input.creer_taches === true }, "agent");
      return { summary: `Guide d'immatriculation : ${r.steps.length} étapes${r.taskIds.length ? `, ${r.taskIds.length} tâches` : ""}`, data: { documentId: r.document.id, etapes: r.steps.map((s) => ({ etape: s.title, base: s.basis.label })) } };
    },
  },
];

type Top = { forme: string; nom: string; raisons: string[] };

export const agentModule: AgentModule = {
  id: "structure",
  tools,
  intents: [
    {
      name: "structure_choix",
      test: /quelle (forme|structure)|choisir (une |la |ma )?(forme|structure)|forme juridique|sarl ou sas|sas ou sarl|statut juridique/,
      async run({ call }) {
        const r = await call("structure_recommander", {});
        const top = ((r?.data as { top?: Top[] })?.top ?? []).slice(0, 3);
        if (!top.length) return null;
        return `🏛️ **Choix de la structure** (repères généraux à confirmer, l'Acte uniforme OHADA n'est pas dans le corpus) :\n${top.map((t, i) => `${i + 1}. **${t.forme}** — ${t.nom} : ${t.raisons.slice(0, 2).join(", ") || "—"}`).join("\n")}\nAffinez le questionnaire et comparez dans l'onglet **Structure & création**.`;
      },
    },
    {
      name: "structure_pacte",
      test: /pacte d.associes|vesting|cliff/,
      async run({ call }) {
        const r = await call("structure_generer_pacte", {});
        return r ? `🤝 ${r.summary} — vesting 48 mois, cliff 12 mois (modifiable). Retrouvez-le dans **Documents**.` : null;
      },
    },
    {
      name: "structure_guide",
      test: /guide d.immatriculation|rccm|simulateur de creation|simuler (la |ma )?creation|comparer (les )?(formes|structures)/,
      async run({ call, message }) {
        if (/simul|compar/.test(message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) {
          const r = await call("structure_simuler_creation", {});
          return r ? `📊 ${r.summary} : coûts et délais indicatifs (exemples) et obligations sourcées dans l'onglet **Structure & création**.` : null;
        }
        const r = await call("structure_guide_immatriculation", {});
        return r ? `🗂️ ${r.summary} — étapes d'exemple, enregistrées dans **Documents**.` : null;
      },
    },
  ],
};
