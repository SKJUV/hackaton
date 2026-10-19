import type { AgentModule, AgentTool, DemoCall, DemoIntent } from "@/lib/agent/registry";
import { legalBasis } from "@/lib/agent/tools";
import type { Grounding } from "@/lib/legal/grounding";
import { groundingMarkdown } from "@/lib/legal/grounding";
import { proposeExternalMessage } from "@/lib/workspace/actions";
import { saveDocument } from "@/lib/workspace/service";
import { citizenAdvice } from "./citizen";
import { assessCrises, communicationPlan, COMMUNIQUE_QUERY, communiqueMarkdown, CRISIS_LABELS, isCrisisType, type CrisisType } from "./crisis";
import { buildMacroDashboard } from "./macro";
import { MEASURES, POLICY_LEGAL_QUERY, simulatePolicy, simulationMarkdown, type MeasureKind } from "./policy";
import { DEMO_BANNER, PROFILES, REGIONS } from "./seed";

/**
 * Outils de l'agent pour le niveau 3 « État » (démo + LLM), enregistrés dans lib/agent/registry.ts
 * (`agentModule`). Préfixe des outils : `etat_`.
 */

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? v.split(/[,;\s]+/).filter(Boolean) : []);

function basis(g: Grounding & { label: string }) {
  return {
    statut: g.status,
    libelle: g.label,
    sources: g.sources.map((x) => ({ id: x.id, document: x.document, page: x.page, articles: x.articles, exemple_non_officiel: x.isExample })),
    consigne: g.status === "non_couvert" ? "Aucun texte du corpus ne couvre ce point : dis-le explicitement, n'invente aucune règle." : "Cite ces sources [Sx] pour tout point juridique.",
  };
}

const DEMO = { bandeau: DEMO_BANNER, consigne_demo: "Données FICTIVES de démonstration : annonce-le clairement (« Démo — données fictives ») et ne présente aucune valeur comme un chiffre officiel." };
const PROFILE_IDS = PROFILES.map((p) => p.id);

const tools: AgentTool[] = [
    {
      name: "etat_tableau_macro",
      description:
        "Niveau État (DÉMO, données fictives) : tableau de bord macroéconomique — prix, change, balance commerciale, emploi informel, granularité régionale et sectorielle, alertes précoces. Option donnees_reelles=true : ajoute une couche RÉELLE sourcée et datée (API publique de la Banque mondiale), séparée des données de démo.",
      parameters: {
        type: "object",
        properties: {
          region: { type: "string", description: `Région à détailler : ${REGIONS.map((r) => r.id).join(", ")}` },
          donnees_reelles: { type: "boolean", description: "Ajouter la couche réelle Banque mondiale (source et date citées)" },
          pays: { type: "string", description: "Code ISO3 pour la couche réelle (défaut CMR)" },
        },
      },
      async run(input) {
        const d = await buildMacroDashboard({ region: str(input.region) || undefined, includeReal: input.donnees_reelles === true || input.donnees_reelles === "true", country: str(input.pays) || undefined });
        const real = d.realLayer;
        return {
          summary: `${DEMO_BANNER} — ${d.kpis.length} indicateurs, ${d.earlyWarnings.length} alerte(s) précoce(s)${real ? ` ; couche réelle Banque mondiale : ${real.status}` : ""}`,
          data: {
            ...DEMO,
            indicateurs: d.kpis.map((k) => ({ indicateur: k.label, valeur: k.latest, unite: k.unit, variation_3_periodes: k.change3, tendance: k.trend, lecture: k.tone })),
            alertes_precoces: d.earlyWarnings,
            regions_les_plus_tendues: d.regions.slice(0, 4).map((r) => ({ region: r.name, tension: r.tension, inflation_alimentaire: r.foodInflation, emploi_informel: r.informalShare })),
            focus_region: d.focus ?? null,
            secteurs: d.sectors.map((s) => ({ secteur: s.name, indice_production: s.latest, variation_3_periodes: s.change3 })),
            couche_reelle: real
              ? real.status === "ok"
                ? { source: real.provider, documentation: real.docUrl, recupere_le: real.fetchedAt, verifiee_le: real.verifiedOn, series: real.series.map((s) => ({ indicateur: `${s.label} (${s.code})`, unite: s.unit, pays: s.countryName, derniere_valeur: s.points[s.points.length - 1], mise_a_jour_api: s.lastUpdated, url: s.sourceUrl, note: s.note })) }
                : { source: real.provider, statut: real.status, raison: real.reason }
              : null,
          },
        };
      },
    },
    {
      name: "etat_alertes_crise",
      description:
        "Niveau État (DÉMO) : évalue les risques de crise (change, approvisionnement, matières premières) à partir d'indicateurs précurseurs, avec score, niveau, fenêtre d'action (jours avant le seuil critique) et actions préventives. Seuils et poids d'exemple affichés.",
      parameters: { type: "object", properties: {} },
      async run() {
        const a = assessCrises();
        const top = a.alerts[0];
        return {
          summary: `${DEMO_BANNER} — risque le plus élevé : ${top.label} (${top.score}/100, ${top.level}) — ${top.actionWindow.label}`,
          data: { ...DEMO, methode: a.method, alertes: a.alerts, indicateurs_precurseurs: a.indicators.map((i) => ({ id: i.id, indicateur: i.label, valeur: i.latest, unite: i.unit, seuil_vigilance: i.vigilance, seuil_critique: i.critical, score: i.score, periodes_avant_seuil_critique: i.periodsToCritical })) },
        };
      },
    },
    {
      name: "etat_plan_communication_crise",
      description:
        "Niveau État (DÉMO) : plan de communication citoyenne segmenté par profil (agriculteur, famille, artisan, commerçant, transporteur) pour un type de crise : quoi stocker raisonnablement, comment adapter sa consommation, aides disponibles (exemples), guidance anti-panique, canaux et calendrier. Cite le corpus (protection du consommateur) quand il couvre le point.",
      parameters: {
        type: "object",
        properties: {
          type_crise: { type: "string", enum: Object.keys(CRISIS_LABELS) },
          profils: { type: "array", items: { type: "string", enum: PROFILE_IDS } },
        },
      },
      async run(input, ctx) {
        const type: CrisisType = isCrisisType(input.type_crise) ? input.type_crise : "approvisionnement";
        const plan = communicationPlan(type, strArr(input.profils));
        const g = await legalBasis(ctx, COMMUNIQUE_QUERY, 3);
        return { summary: `${DEMO_BANNER} — plan « ${plan.crisisLabel} » pour ${plan.segments.length} profil(s) — ${g.label}`, data: { ...DEMO, fondement_juridique: basis(g), plan } };
      },
    },
    {
      name: "etat_preparer_communique",
      description:
        "Niveau État (DÉMO) : rédige un projet de communiqué citoyen anti-panique pour une crise (enregistré dans Documents, à valider). Si des destinataires sont fournis (ex. cellule de communication), un email est préparé et placé dans la file d'approbation : rien n'est diffusé sans validation humaine.",
      external: true,
      parameters: {
        type: "object",
        properties: {
          type_crise: { type: "string", enum: Object.keys(CRISIS_LABELS) },
          profil: { type: "string", enum: PROFILE_IDS },
          destinataires: { type: "array", items: { type: "string" }, description: "Adresses email (facultatif)" },
        },
      },
      async run(input, ctx) {
        const type: CrisisType = isCrisisType(input.type_crise) ? input.type_crise : "approvisionnement";
        const profile = PROFILE_IDS.includes(str(input.profil) as (typeof PROFILE_IDS)[number]) ? str(input.profil) : undefined;
        const plan = communicationPlan(type, profile ? [profile] : undefined);
        const g = await legalBasis(ctx, COMMUNIQUE_QUERY, 3);
        const content = communiqueMarkdown(plan, profile) + "\n" + groundingMarkdown(g);
        const title = `Communiqué citoyen (démo) — ${plan.crisisLabel}${profile ? ` — ${plan.segments[0]?.label}` : ""}`;
        const doc = await saveDocument(ctx.companyId, { title, kind: "note", content, needsReview: true }, "agent");
        const to = strArr(input.destinataires).filter((x) => x.includes("@"));
        let approvalId: string | null = null;
        if (to.length) {
          const { approval } = await proposeExternalMessage(ctx.companyId, {
            module: "etat",
            type: "etat_communique",
            title: `Transmettre le projet de communiqué « ${plan.crisisLabel} » (démo)`,
            summary: `À : ${to.join(", ")} — projet à valider, aucune diffusion au public`,
            channel: "email",
            to,
            subject: `[${DEMO_BANNER}] Projet de ${title}`,
            body: `Bonjour,\n\nVeuillez trouver ci-dessous le projet de communiqué à valider avant toute diffusion.\n\n${content}\n\nCordialement`,
            relatedType: "document",
            relatedId: doc.id,
            legalQuery: COMMUNIQUE_QUERY,
          });
          approvalId = approval.id;
        }
        return {
          summary: `Projet de communiqué enregistré (à valider)${approvalId ? " + email en attente d'approbation" : ""} — ${g.label}`,
          data: { ...DEMO, documentId: doc.id, approbation: approvalId, fondement_juridique: basis(g) },
        };
      },
    },
    {
      name: "etat_conseils_citoyens",
      description:
        "Économie citoyenne (DÉMO) : traduit l'actualité économique (exemples fictifs) en conseils pratiques pour un profil (agriculteur, famille, artisan, commerçant, transporteur), avec les programmes d'aide (exemples non officiels) et les références juridiques du corpus quand elles existent.",
      parameters: {
        type: "object",
        properties: {
          profil: { type: "string", enum: PROFILE_IDS },
          actualites: { type: "array", items: { type: "string" }, description: "Identifiants d'actualités (facultatif : toutes par défaut)" },
        },
        required: ["profil"],
      },
      async run(input, ctx) {
        const adv = citizenAdvice(str(input.profil, "famille"), strArr(input.actualites));
        const g = await legalBasis(ctx, adv.legalQuery, 3);
        return {
          summary: `${DEMO_BANNER} — ${adv.conseils.length} conseil(s) pour « ${adv.profile.label} », ${adv.aides.length} programme(s) d'exemple — ${g.label}`,
          data: { ...DEMO, profil: adv.profile, actualites: adv.news, conseils: adv.conseils, programmes_aide_exemples: adv.aides, fondement_juridique: basis(g) },
        };
      },
    },
    {
      name: "etat_simuler_politique",
      description: `Simulateur de politiques (DÉMO) : impact d'une mesure par catégorie de prix, secteur, profil et région, avec effet budgétaire et effets non intentionnels. Modèle linéaire transparent, hypothèses affichées et modifiables. Mesures : ${MEASURES.map((m) => `${m.id} (${m.valueLabel})`).join(" ; ")}.`,
      parameters: {
        type: "object",
        properties: {
          mesure: { type: "string", enum: MEASURES.map((m) => m.id) },
          valeur: { type: "number" },
          cible: { type: "string", description: "Catégorie (alimentation, energie_transport, biens_importes, services, toutes) ou profils ciblés séparés par des virgules pour un transfert" },
          hypotheses: { type: "object", description: "Surcharges d'hypothèses (ex. { repercussionTaxe: 0.5 })" },
          enregistrer: { type: "boolean", description: "Enregistrer la simulation dans Documents" },
        },
        required: ["mesure", "valeur"],
      },
      async run(input, ctx) {
        const sim = simulatePolicy({ kind: str(input.mesure), value: Number(input.valeur), target: str(input.cible) || undefined, assumptions: (input.hypotheses ?? {}) as Record<string, number> });
        const g = await legalBasis(ctx, POLICY_LEGAL_QUERY[sim.measure.kind], 3);
        let documentId: string | null = null;
        if (input.enregistrer === true || input.enregistrer === "true") {
          const doc = await saveDocument(ctx.companyId, { title: `Simulation (démo) — ${sim.measure.label}`, kind: "note", content: simulationMarkdown(sim) + "\n" + groundingMarkdown(g), needsReview: true }, "agent");
          documentId = doc.id;
        }
        const worst = [...sim.profiles].sort((a, b) => a.purchasingPower - b.purchasingPower)[0];
        return {
          summary: `${DEMO_BANNER} — ${sim.measure.label} ${sim.measure.value} : coût de la vie national ${sim.national.costOfLiving} %, budget ${sim.budget.annualMdFcfa} Md FCFA/an, profil le plus touché ${worst.label} — ${g.label}`,
          data: { ...DEMO, documentId, fondement_juridique: basis(g), ...sim, structure: undefined },
        };
      },
    },
];

/* --------------------------------------------- Planificateur démo (sans clé IA) */

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const ETAT_INTENTS = [
  { name: "etat_simulateur", test: /\b(simul\w* (d.une |une |la |l.|de |d.)?(politique|mesure|hausse|baisse|subvention|tva|reforme|impact|transfert)|politique publique|mesure fiscale|reforme fiscale|transfert monetaire|subventions? (des|du|sur|aux?) )|\b(hausse|baisse|augment\w*|reduction|reduire|baisser|relever)\b.{0,30}\b(tva|droits? de douane|prix du carburant)\b/ },
  { name: "etat_crise", test: /\b(crise|crises|panique|penurie|choc economique|alertes? (de |precoces?)|communique citoyen)/ },
  { name: "etat_citoyen", test: /\b(conseils? (pratiques|economiques)|economie citoyenne|programmes? d.aide|budget familial)\b|\b(agriculteurs?|artisans?|familles?|menages?|transporteurs?|commercants?)\b.{0,60}\b(inflation|prix|fcfa|crise|actualite|budget|economi\w*)/ },
  { name: "etat_macro", test: /\b(macro\w*|inflation|taux de change|balance commerciale|emploi informel|indicateurs? economiques?|banque mondiale|tableau de bord national)\b/ },
];

export function detectProfile(message: string): string | undefined {
  const m = norm(message);
  if (/agricult|paysan|cultivat|eleveur/.test(m)) return "agriculteur";
  if (/artisan|couturi|menuisi|mecanicien/.test(m)) return "artisan";
  if (/commercant|boutique|detaillant/.test(m)) return "commercant";
  if (/transporteur|moto-?taxi|chauffeur/.test(m)) return "transporteur";
  if (/famille|menage|foyer|parents?/.test(m)) return "famille";
  return undefined;
}

/** Actualités d'exemple évoquées dans le message (aucune → actualité « inflation » par défaut). */
export function detectNews(message: string): string[] {
  const m = norm(message);
  const ids: string[] = [];
  if (/inflation|prix (des )?(denrees|aliment)|vie chere/.test(m)) ids.push("actu-inflation");
  if (/apprecia|fcfa (fort|monte)/.test(m)) ids.push("actu-fcfa-apprecie");
  if (/deprecia|devaluation|dollar (cher|monte)/.test(m)) ids.push("actu-fcfa-deprecie");
  if (/carburant|essence|gasoil/.test(m)) ids.push("actu-carburant");
  if (/credit|taux d.interet|emprunt/.test(m)) ids.push("actu-credit");
  if (/programmes? d.aide|aide publique|financement public/.test(m)) ids.push("actu-programme");
  return ids.length ? ids : ["actu-inflation", "actu-programme"];
}

export function detectCrisis(message: string): CrisisType {
  const m = norm(message);
  if (/change|devise|dollar|reserves?/.test(m)) return "change";
  if (/matieres? premieres?|cacao|cafe|coton|export/.test(m)) return "matieres_premieres";
  return "approvisionnement";
}

export function parseMeasure(message: string): { mesure: MeasureKind; valeur: number; cible?: string } {
  const m = norm(message);
  const mesure: MeasureKind = /douane/.test(m) ? "droit_douane" : /carburant|essence|gasoil|pompe/.test(m) ? "carburant" : /transfert|allocation|cash/.test(m) ? "transfert" : /subvention/.test(m) ? "subvention" : "tva";
  const def = MEASURES.find((x) => x.id === mesure)!;
  const num = m.match(/(\d+(?:[.,]\d+)?)\s*(?:%|points?|pts?|fcfa|f\b)/) ?? m.match(/(\d+(?:[.,]\d+)?)/);
  let valeur = num ? Number(num[1].replace(",", ".")) : def.defaultValue;
  if (mesure === "transfert" && /(\d+)\s*000/.test(m)) valeur = Number(m.match(/(\d+)\s*000/)![1]) * 1000;
  if (/\b(baisse|baisser|reduction|reduire|diminu\w*|suppression)\b/.test(m) && mesure !== "subvention" && mesure !== "transfert") valeur = -Math.abs(valeur);
  const cible = /aliment|denree|vivrier/.test(m) ? "alimentation" : /import/.test(m) ? "biens_importes" : /service/.test(m) ? "services" : /energie|transport/.test(m) && mesure !== "carburant" ? "energie_transport" : undefined;
  return { mesure, valeur, cible: mesure === "transfert" ? detectProfile(message) : cible };
}

type Call = DemoCall;

/** Exécute une intention « État » en mode démo ; renvoie les lignes de réponse. */
export async function runEtatDemo(intent: string, message: string, call: Call): Promise<string[]> {
  const m = norm(message);
  switch (intent) {
    case "etat_macro": {
      const region = REGIONS.find((r) => m.includes(norm(r.name)))?.id;
      const r = await call("etat_tableau_macro", { region, donnees_reelles: /reel|banque mondiale|vraies? donnees/.test(m) });
      if (!r) return [];
      const d = r.data as { alertes_precoces: { message: string }[]; couche_reelle: { series?: { indicateur: string; derniere_valeur: { year: string; value: number } }[]; source: string; recupere_le?: string } | null; focus_region: { highlights: string[] } | null };
      const real = d.couche_reelle?.series?.length ? `\n**Couche réelle** (${d.couche_reelle.source}, récupérée le ${d.couche_reelle.recupere_le?.slice(0, 10)}) :\n${d.couche_reelle.series.map((s) => `- ${s.indicateur} : ${s.derniere_valeur.value} (${s.derniere_valeur.year})`).join("\n")}` : "";
      return [`📈 **${r.summary}** (onglet **État** → Tableau macro).\n${d.alertes_precoces.map((a) => `- ⚠️ ${a.message}`).join("\n")}${d.focus_region ? `\n${d.focus_region.highlights.map((h) => `- ${h}`).join("\n")}` : ""}${real}`];
    }
    case "etat_crise": {
      const a = await call("etat_alertes_crise", {});
      const lines: string[] = [];
      if (a) {
        const al = (a.data as { alertes: { label: string; score: number; level: string; actionWindow: { label: string } }[] }).alertes;
        lines.push(`🚨 **${DEMO_BANNER} — risques de crise** :\n${al.map((x) => `- ${x.label} : ${x.score}/100 (${x.level}) — ${x.actionWindow.label}`).join("\n")}`);
      }
      const profile = detectProfile(message);
      const p = await call("etat_plan_communication_crise", { type_crise: detectCrisis(message), profils: profile ? [profile] : [] });
      if (p) lines.push(`📣 ${p.summary}. Le plan complet (messages par profil, canaux, calendrier, consignes anti-panique) est dans l'onglet **État** → Crise.`);
      return lines;
    }
    case "etat_citoyen": {
      const r = await call("etat_conseils_citoyens", { profil: detectProfile(message) ?? "famille", actualites: detectNews(message) });
      if (!r) return [];
      const d = r.data as { conseils: string[]; programmes_aide_exemples: { name: string }[] };
      return [`💡 **${r.summary}**\n${d.conseils.slice(0, 5).map((c) => `- ${c}`).join("\n")}\nProgrammes (exemples non officiels) : ${d.programmes_aide_exemples.map((x) => x.name).join(" ; ") || "—"}`];
    }
    case "etat_simulateur": {
      const p = parseMeasure(message);
      const r = await call("etat_simuler_politique", { ...p });
      if (!r) return [];
      const d = r.data as { warnings: string[] };
      return [`🧮 **${r.summary}**\n${d.warnings.map((w) => `- ${w}`).join("\n")}\nHypothèses et formules affichées dans l'onglet **État** → Simulateur.`];
    }
    default:
      return [];
  }
}

/** Intentions du planificateur démo (sans clé IA). */
const intents: DemoIntent[] = ETAT_INTENTS.map((i) => ({
  name: i.name,
  test: i.test,
  run: async ({ message, call }) => {
    const lines = await runEtatDemo(i.name, message, call);
    return lines.length ? lines.join("\n\n") : null;
  },
}));

export const agentModule: AgentModule = { id: "etat", tools, intents };
