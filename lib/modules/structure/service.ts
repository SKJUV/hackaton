import { sectorQuery } from "@/lib/agent/tools";
import { groundingLabel, groundingMarkdown, groundQuery, type Grounding, type GroundingSource } from "@/lib/legal/grounding";
import { forCompany, moduleState } from "@/lib/modules/state";
import { createTask, log, saveDocument, WorkspaceError } from "@/lib/workspace/service";
import { newId, nowIso, readData, withData } from "@/lib/workspace/store";
import type { Company } from "@/lib/workspace/types";
import { CATALOG_NOTICE, FORM_MAP, LEGAL_FORMS, type FormId, type LegalFormInfo } from "./catalog";

/* ------------------------------------------------------------------ types & état */

export type Basis = { status: Grounding["status"]; label: string; query: string; sources: GroundingSource[] };
const basis = (g: Grounding): Basis => ({ status: g.status, label: groundingLabel(g), query: g.query, sources: g.sources });

export type Questionnaire = {
  founders: number;
  wantsInvestors: boolean;
  limitedLiability: boolean;
  budget: "faible" | "moyen" | "eleve";
  wantsFlexibility: boolean;
  /** Mutualiser des moyens entre entreprises existantes. */
  pooling?: boolean;
};

export type Recommendation = { form: FormId; name: string; score: number; eligible: boolean; reasons: string[]; cautions: string[]; basis?: Basis };

type ChoiceRecord = { id: string; companyId: string; at: string; questionnaire: Questionnaire; ranking: { form: FormId; score: number }[]; chosen?: FormId; chosenAt?: string; isExample?: boolean };
type PacteRecord = { id: string; companyId: string; at: string; documentId: string; associates: number; vestingMonths: number; cliffMonths: number };
type GuideRecord = { id: string; companyId: string; at: string; form: FormId; documentId: string; taskIds: string[] };

const seed = () => ({ choices: [] as ChoiceRecord[], pactes: [] as PacteRecord[], guides: [] as GuideRecord[] });
const state = (d: Parameters<typeof moduleState>[0]) => moduleState(d, "structure", seed);

async function company(companyId: string): Promise<Company> {
  const data = await readData();
  const c = data.companies.find((x) => x.id === companyId);
  if (!c) throw new WorkspaceError("Entreprise introuvable.", 404);
  return c;
}

const sourcesMeta = (g: Grounding) => ({ legalQuery: g.query, legalSources: g.sources });

/* ------------------------------------------------------------------ 1. choix guidé */

export function scoreForms(q: Questionnaire): Recommendation[] {
  const founders = Math.max(1, Math.floor(q.founders || 1));
  return LEGAL_FORMS.map((f) => {
    const reasons: string[] = [];
    let score = 0;
    const eligible = founders >= f.founders.min && (f.founders.max === undefined || founders <= f.founders.max);
    if (!eligible) reasons.push(f.founders.max === 1 ? "réservée à un fondateur seul" : `au moins ${f.founders.min} associés`);
    if (q.limitedLiability) {
      if (f.liability === "limitee") { score += 3; reasons.push("responsabilité limitée aux apports"); }
      else score -= 4;
    }
    if (q.wantsInvestors) { score += f.investorFriendly * 2; if (f.investorFriendly >= 3) reasons.push("adaptée à l'entrée d'investisseurs (actions, clauses statutaires)"); }
    if (q.wantsFlexibility) { score += f.flexibility; if (f.flexibility >= 3) reasons.push("organisation librement définie par les statuts"); }
    const budgetWeight = q.budget === "faible" ? 2 : q.budget === "moyen" ? 1 : 0;
    score += f.simplicity * budgetWeight;
    if (q.budget === "faible" && f.exampleCostFcfa[1] <= 450_000) reasons.push("coût de création modéré (exemple indicatif)");
    if (q.budget !== "eleve" && f.id === "SA") score -= 3;
    if (q.pooling) { if (f.id === "GIE") { score += 6; reasons.push("conçu pour mutualiser des moyens"); } }
    else if (f.id === "GIE") score -= 3;
    if (!eligible) score -= 100;
    return { form: f.id, name: f.name, score, eligible, reasons, cautions: f.cautions };
  }).sort((a, b) => b.score - a.score);
}

export async function recommendStructure(companyId: string, q: Questionnaire, actor = "utilisateur") {
  const c = await company(companyId);
  const ranking = scoreForms(q);
  const top = ranking.filter((r) => r.eligible).slice(0, 3);
  const [sectorG, ...formG] = await Promise.all([groundQuery(sectorQuery(c), 3), ...top.map((r) => groundQuery(FORM_MAP.get(r.form)!.legalQuery, 3))]);
  top.forEach((r, i) => (r.basis = basis(formG[i])));
  const sector = basis(sectorG);
  const record = await withData((d) => {
    const rec: ChoiceRecord = { id: newId("stc"), companyId, at: nowIso(), questionnaire: q, ranking: ranking.map((r) => ({ form: r.form, score: r.score })) };
    state(d).choices.push(rec);
    log(d, companyId, actor, "structure.recommandation", `Formes recommandées : ${top.map((r) => r.form).join(", ")} (questionnaire ${q.founders} fondateur(s)).`);
    return rec;
  });
  return { id: record.id, ranking, top, sector, notice: CATALOG_NOTICE };
}

/** Enregistre la forme retenue (mémoire des décisions) et met à jour la forme juridique de l'entreprise. */
export async function chooseStructure(companyId: string, form: FormId, actor = "utilisateur", reason?: string) {
  const f = FORM_MAP.get(form);
  if (!f) throw new WorkspaceError("Forme juridique inconnue.");
  return withData((d) => {
    const c = d.companies.find((x) => x.id === companyId);
    if (!c) throw new WorkspaceError("Entreprise introuvable.", 404);
    const previous = c.legalForm;
    c.legalForm = f.id;
    const st = state(d);
    const last = [...forCompany(st.choices, companyId)].reverse()[0];
    if (last && !last.chosen) Object.assign(last, { chosen: f.id, chosenAt: nowIso() });
    else st.choices.push({ id: newId("stc"), companyId, at: nowIso(), questionnaire: { founders: 0, wantsInvestors: false, limitedLiability: false, budget: "moyen", wantsFlexibility: false }, ranking: [], chosen: f.id, chosenAt: nowIso() });
    log(d, companyId, actor, "structure.choix", `Décision : forme juridique ${f.id} (${f.name})${previous && previous !== f.id ? `, remplace ${previous}` : ""}${reason ? ` — motif : ${reason}` : ""}.`);
    return { form: f.id, previous };
  });
}

/* ------------------------------------------------------------------ 2. simulateur de création */

const CATEGORY_QUERIES: { id: string; label: string; query: (f: LegalFormInfo, c: Company) => string }[] = [
  { id: "statuts", label: "Statuts & constitution", query: (f) => `statuts constitution ${f.name}` },
  { id: "capital", label: "Capital & apports", query: (f) => `capital social apports libération ${f.name}` },
  { id: "comptabilite", label: "Comptabilité", query: () => "tenue de la comptabilité états financiers annuels" },
  { id: "fiscal", label: "Fiscalité & immatriculation fiscale", query: () => "impôt sur les sociétés déclaration fiscale numéro d'identifiant contribuable" },
  { id: "social", label: "Social (si salariés)", query: () => "affiliation sécurité sociale employeur déclaration des salariés" },
  { id: "sectoriel", label: "Autorisations sectorielles", query: (_f, c) => sectorQuery(c) },
];

export type SimulationRow = { category: string; label: string; repere: string; basis: Basis };
export type SimulationColumn = { form: FormId; name: string; rows: SimulationRow[]; exampleCostFcfa: [number, number]; exampleDelayDays: [number, number]; needsCapitalDeposit: boolean; isExample: true };

export async function simulateCreation(companyId: string, forms: FormId[]) {
  const c = await company(companyId);
  const list = [...new Set(forms)].filter((f) => FORM_MAP.has(f)).slice(0, 4);
  if (!list.length) throw new WorkspaceError("Choisissez au moins une forme juridique.");
  const queries = [...new Set(list.flatMap((id) => CATEGORY_QUERIES.map((cat) => cat.query(FORM_MAP.get(id)!, c))))];
  const results = await Promise.all(queries.map((q) => groundQuery(q, 2)));
  const cache = new Map(queries.map((q, i) => [q, basis(results[i])]));
  const columns: SimulationColumn[] = [];
  for (const id of list) {
    const f = FORM_MAP.get(id)!;
    const rows: SimulationRow[] = CATEGORY_QUERIES.map((cat) => ({
      category: cat.id,
      label: cat.label,
      repere: cat.id === "statuts" ? f.governance : cat.id === "capital" ? f.capitalRepere : cat.id === "sectoriel" ? `Activité « ${c.sector} » : vérifier licences et autorisations.` : "Voir les textes cités (identique quelle que soit la forme).",
      basis: cache.get(cat.query(f, c))!,
    }));
    columns.push({ form: id, name: f.name, rows, exampleCostFcfa: f.exampleCostFcfa, exampleDelayDays: f.exampleDelayDays, needsCapitalDeposit: f.needsCapitalDeposit, isExample: true });
  }
  await withData((d) => log(d, companyId, "utilisateur", "structure.simulation", `Simulation de création : ${list.join(" vs ")}.`));
  return { columns, notice: CATALOG_NOTICE };
}

/* ------------------------------------------------------------------ 3. pacte d'associés avec vesting */

export type PacteAssociate = { name: string; percent: number; role?: string; vesting?: boolean };
export type PacteInput = {
  associates: PacteAssociate[];
  vestingMonths?: number;
  cliffMonths?: number;
  frequency?: "mensuel" | "trimestriel";
  startDate?: string;
  lockUpMonths?: number;
  preemption?: boolean;
  dragAlong?: number; // seuil en %
  tagAlong?: boolean;
};

export type VestingRow = { month: number; label: string; byAssociate: Record<string, number> };

/** Calendrier d'acquisition : rien avant le cliff, puis acquisition linéaire par période. */
export function vestingSchedule(associates: PacteAssociate[], vestingMonths = 48, cliffMonths = 12, frequency: "mensuel" | "trimestriel" = "mensuel"): VestingRow[] {
  const step = frequency === "trimestriel" ? 3 : 1;
  const vested = (a: PacteAssociate, m: number) => {
    if (a.vesting === false) return a.percent;
    if (m < cliffMonths) return 0;
    const periods = Math.floor(Math.min(m, vestingMonths) / step) * step;
    return Math.round(((a.percent * periods) / vestingMonths) * 100) / 100;
  };
  const marks = [...new Set([0, cliffMonths, ...Array.from({ length: Math.ceil(vestingMonths / 12) }, (_, i) => (i + 1) * 12), vestingMonths])]
    .filter((m) => m <= vestingMonths)
    .sort((a, b) => a - b);
  return marks.map((m) => ({
    month: m,
    label: m === 0 ? "Signature" : m === cliffMonths ? `Cliff (${m} mois)` : `${m} mois`,
    byAssociate: Object.fromEntries(associates.map((a) => [a.name, vested(a, m)])),
  }));
}

export function validatePacte(input: PacteInput) {
  const associates = (input.associates ?? []).map((a) => ({ ...a, name: String(a.name ?? "").trim(), percent: Number(a.percent) }));
  if (associates.length < 2) throw new WorkspaceError("Un pacte d'associés nécessite au moins deux associés.");
  if (associates.some((a) => !a.name || !Number.isFinite(a.percent) || a.percent <= 0)) throw new WorkspaceError("Chaque associé doit avoir un nom et un pourcentage positif.");
  if (new Set(associates.map((a) => a.name.toLowerCase())).size !== associates.length) throw new WorkspaceError("Deux associés portent le même nom.");
  const total = associates.reduce((s, a) => s + a.percent, 0);
  if (Math.abs(total - 100) > 0.01) throw new WorkspaceError(`La répartition doit totaliser 100 % (actuellement ${Math.round(total * 100) / 100} %).`);
  const vestingMonths = Math.min(120, Math.max(1, Math.floor(input.vestingMonths ?? 48)));
  const cliffMonths = Math.min(vestingMonths, Math.max(0, Math.floor(input.cliffMonths ?? 12)));
  return { ...input, associates, vestingMonths, cliffMonths, frequency: input.frequency ?? "mensuel", lockUpMonths: Math.max(0, Math.floor(input.lockUpMonths ?? 24)), preemption: input.preemption ?? true, dragAlong: input.dragAlong ?? 75, tagAlong: input.tagAlong ?? true };
}

export async function generatePacte(companyId: string, raw: PacteInput, actor = "utilisateur") {
  const c = await company(companyId);
  const p = validatePacte(raw);
  const schedule = vestingSchedule(p.associates, p.vestingMonths, p.cliffMonths, p.frequency);
  const g = await groundQuery("cession de parts sociales actions agrément préemption associés", 4);
  const start = p.startDate ? new Date(p.startDate).toLocaleDateString("fr-FR") : "date de signature";
  const names = p.associates.map((a) => a.name);
  const md = [
    `# Pacte d'associés — ${c.name}`,
    "",
    `> ⚠️ **Trame d'exemple générée par Co-founder** : à adapter et faire valider par un avocat ou un notaire. Les clauses ci-dessous sont des usages contractuels courants, pas des textes de loi.`,
    "",
    `Forme juridique : **${c.legalForm || "à définir"}** · Siège : ${c.city} · Date d'effet du vesting : ${start}`,
    "",
    "## 1. Parties et répartition",
    "",
    "| Associé | Rôle | Participation | Vesting |",
    "| --- | --- | --- | --- |",
    ...p.associates.map((a) => `| ${a.name} | ${a.role || "associé"} | ${a.percent} % | ${a.vesting === false ? "non (acquis à la signature)" : "oui"} |`),
    "",
    "## 2. Acquisition progressive des titres (vesting)",
    "",
    `- Durée : **${p.vestingMonths} mois**, période d'acquisition minimale (cliff) : **${p.cliffMonths} mois**.`,
    `- Après le cliff, acquisition **${p.frequency === "mensuel" ? "mensuelle" : "trimestrielle"}** et linéaire jusqu'à ${p.vestingMonths} mois.`,
    "- Les titres non acquis au départ d'un associé font l'objet d'une promesse de cession au profit de la société ou des autres associés.",
    "",
    `| Échéance | ${names.join(" | ")} |`,
    `| --- | ${names.map(() => "---").join(" | ")} |`,
    ...schedule.map((r) => `| ${r.label} | ${names.map((n) => `${r.byAssociate[n]} %`).join(" | ")} |`),
    "",
    "## 3. Départ d'un associé (good / bad leaver)",
    "",
    "- **Good leaver** (décès, invalidité, départ d'un commun accord, licenciement sans faute) : rachat des titres non acquis à leur valeur réelle (à définir).",
    "- **Bad leaver** (faute grave, violation du pacte ou de la non-concurrence, démission avant le cliff) : rachat des titres non acquis à leur valeur nominale.",
    "",
    "## 4. Transfert des titres",
    "",
    `- **Inaliénabilité (lock-up)** : ${p.lockUpMonths} mois à compter de la signature, sauf accord unanime.`,
    p.preemption ? "- **Préemption** : droit de préférence des associés, au prorata de leur participation, sur toute cession à un tiers." : "- Pas de droit de préemption conventionnel.",
    `- **Sortie forcée (drag-along)** : si des associés représentant au moins ${p.dragAlong} % acceptent une offre portant sur 100 % du capital, les autres s'engagent à céder aux mêmes conditions.`,
    p.tagAlong ? "- **Sortie conjointe (tag-along)** : en cas de cession du contrôle, chaque associé peut céder ses titres aux mêmes conditions." : "- Pas de clause de sortie conjointe.",
    "",
    "## 5. Gouvernance, confidentialité et non-concurrence",
    "",
    "- Décisions importantes (budget, levée de fonds, embauche clé, cession d'actifs) soumises à l'accord des associés détenant au moins 2/3 des titres (à adapter).",
    "- Confidentialité pendant le pacte et 3 ans après ; non-concurrence et non-sollicitation pendant la présence au capital et 12 mois après (à apprécier par un professionnel).",
    "",
    "## 6. Articulation avec les statuts",
    "",
    "- En cas de contradiction, les statuts s'imposent aux tiers ; le pacte lie les signataires. Les clauses d'agrément et de préemption peuvent aussi figurer dans les statuts.",
    groundingMarkdown(g),
  ].join("\n");
  const doc = await saveDocument(companyId, { title: `Pacte d'associés (vesting ${p.vestingMonths} mois)`, kind: "contrat", content: md, needsReview: true, ...sourcesMeta(g) }, actor);
  await withData((d) => {
    state(d).pactes.push({ id: newId("stp"), companyId, at: nowIso(), documentId: doc.id, associates: p.associates.length, vestingMonths: p.vestingMonths, cliffMonths: p.cliffMonths });
    log(d, companyId, actor, "structure.pacte", `Pacte d'associés généré (${p.associates.length} associés, vesting ${p.vestingMonths} mois, cliff ${p.cliffMonths} mois).`);
  });
  return { document: doc, schedule, basis: basis(g) };
}

/* ------------------------------------------------------------------ 4. guide d'immatriculation */

type StepDef = { title: string; detail: string; query: (c: Company, f: LegalFormInfo) => string; offsetDays: number; when?: (f: LegalFormInfo) => boolean };
const STEPS: StepDef[] = [
  { title: "Vérifier la disponibilité du nom commercial", detail: "Recherche d'antériorité et réservation du nom auprès du guichet de création.", query: () => "nom commercial dénomination sociale registre du commerce", offsetDays: 2 },
  { title: "Rédiger et signer les statuts (et le pacte d'associés)", detail: "Statuts conformes à la forme retenue ; pacte d'associés séparé si plusieurs associés.", query: (_c, f) => `statuts ${f.name}`, offsetDays: 7, when: (f) => f.id !== "EI" },
  { title: "Déposer le capital social", detail: "Dépôt des fonds auprès d'une banque ou d'un notaire et obtention de l'attestation de dépôt.", query: () => "dépôt des fonds capital social attestation banque notaire", offsetDays: 10, when: (f) => f.needsCapitalDeposit },
  { title: "Constituer le dossier au guichet unique de création", detail: "Au Cameroun, les formalités sont regroupées dans les Centres de formalités de création d'entreprises (CFCE) — à confirmer pour votre ville.", query: () => "centre de formalités création d'entreprise guichet unique", offsetDays: 14 },
  { title: "Immatriculation au registre du commerce (RCCM)", detail: "Obtention du numéro d'immatriculation.", query: () => "immatriculation registre du commerce et du crédit mobilier", offsetDays: 15 },
  { title: "Immatriculation fiscale (NIU) et régime d'imposition", detail: "Numéro d'identifiant unique, choix / notification du régime fiscal.", query: () => "numéro d'identifiant unique contribuable immatriculation fiscale", offsetDays: 20 },
  { title: "Affiliation employeur à la sécurité sociale", detail: "Dès la première embauche.", query: () => "affiliation employeur sécurité sociale prévoyance sociale", offsetDays: 30 },
  { title: "Obtenir les autorisations sectorielles", detail: "Licences, agréments ou déclarations propres à l'activité.", query: (c) => sectorQuery(c), offsetDays: 45 },
  { title: "Publicité légale et ouverture du compte bancaire définitif", detail: "Annonce légale si requise, déblocage du capital.", query: () => "annonce légale journal habilité publicité", offsetDays: 21, when: (f) => f.id !== "EI" },
];

export type GuideStep = { order: number; title: string; detail: string; exampleDelayDays: number; basis: Basis; isExample: true };

export async function registrationGuide(companyId: string, form: FormId, options: { createTasks?: boolean } = {}, actor = "utilisateur") {
  const c = await company(companyId);
  const f = FORM_MAP.get(form);
  if (!f) throw new WorkspaceError("Forme juridique inconnue.");
  const steps: GuideStep[] = [];
  const allSources = new Map<string, GroundingSource>();
  const defs = STEPS.filter((s) => !s.when || s.when(f));
  const grounded = await Promise.all(defs.map((def) => groundQuery(def.query(c, f), 2)));
  defs.forEach((def, i) => {
    const g = grounded[i];
    for (const src of g.sources) allSources.set(`${src.file}#${src.page}`, src);
    steps.push({ order: i + 1, title: def.title, detail: def.detail, exampleDelayDays: def.offsetDays, basis: basis(g), isExample: true });
  });
  const sources = [...allSources.values()];
  const md = [
    `# Guide d'immatriculation — ${c.name} (${f.id})`,
    "",
    `> ⚠️ **Parcours d'exemple** : étapes génériques et délais indicatifs, à confirmer auprès du guichet de création. ${CATALOG_NOTICE}`,
    "",
    ...steps.flatMap((s) => [
      `## ${s.order}. ${s.title}`,
      "",
      s.detail,
      "",
      `- Délai indicatif (exemple) : J+${s.exampleDelayDays}`,
      `- Base juridique : ${s.basis.status === "non_couvert" ? "⚠️ non couvert par le corpus officiel — à vérifier" : s.basis.label}`,
      "",
    ]),
  ].join("\n");
  const doc = await saveDocument(companyId, { title: `Guide d'immatriculation (${f.id})`, kind: "note", content: md, needsReview: true, legalQuery: `immatriculation ${f.name}`, legalSources: sources }, actor);
  const taskIds: string[] = [];
  if (options.createTasks) {
    for (const s of steps) {
      const due = new Date(Date.now() + s.exampleDelayDays * 86_400_000).toISOString();
      const t = await createTask(companyId, { title: `[Immatriculation] ${s.title}`, description: `${s.detail} (échéance indicative, exemple)`, dueDate: due, source: actor === "agent" ? "agent" : "utilisateur" }, actor);
      taskIds.push(t.id);
    }
  }
  await withData((d) => {
    state(d).guides.push({ id: newId("stg"), companyId, at: nowIso(), form: f.id, documentId: doc.id, taskIds });
    log(d, companyId, actor, "structure.guide", `Guide d'immatriculation ${f.id} généré (${steps.length} étapes${taskIds.length ? `, ${taskIds.length} tâches créées` : ""}).`);
  });
  return { document: doc, steps, taskIds, notice: CATALOG_NOTICE };
}

/* ------------------------------------------------------------------ lecture */

export async function structureState(companyId: string) {
  const data = await readData();
  const st = state(data);
  const c = data.companies.find((x) => x.id === companyId);
  return {
    legalForm: c?.legalForm ?? "",
    forms: LEGAL_FORMS,
    notice: CATALOG_NOTICE,
    choices: forCompany(st.choices, companyId).slice(-5).reverse(),
    pactes: forCompany(st.pactes, companyId).slice(-5).reverse(),
    guides: forCompany(st.guides, companyId).slice(-5).reverse(),
    members: data.members.filter((m) => m.companyId === companyId).map((m) => ({ id: m.id, name: m.name, role: m.role })),
  };
}
