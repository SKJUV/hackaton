/**
 * Module Idée — diagnostic HONNÊTE (jamais de validation automatique) :
 * obstacles réglementaires cités article par article depuis le corpus officiel, indicateurs de marché issus
 * des publications officielles du corpus (ART), concurrents (déclarés, recherche web réelle si configurée,
 * sinon catégories génériques signalées), forces, faiblesses, conditions de succès et pivots.
 */
import { loadDocumentChunks, searchDocuments } from "@/lib/documents";
import type { Company } from "@/lib/workspace/types";
import { regulatoryTheme } from "./grounding";
import { readModule, withModule } from "./store";
import { skillGaps } from "./scoring";
import type { Ctx, IdeaDiagnostic, IdeaInput, RegulatoryTheme } from "./types";
import { hasKeyword, norm } from "./util";
import { webSearch } from "./websearch";
import { newId, nowIso } from "@/lib/workspace/store";

type Theme = { id: string; theme: string; query: string; triggers: string[]; regulated?: boolean; always?: boolean };

export const THEMES: Theme[] = [
  { id: "postal", theme: "Activité postale (courrier, colis, express)", query: "autorisation exploitation service postal courrier colis express", triggers: ["colis", "courrier", "postal", "express", "livraison"], regulated: true },
  { id: "telecom", theme: "Communications électroniques (réseau, accès Internet)", query: "licence exploitation réseau communications électroniques fournisseur accès internet", triggers: ["internet", "telecommunications", "reseau", "frequences", "wifi", "communications electroniques", "operateur"], regulated: true },
  { id: "paiement", theme: "Paiement et monnaie électronique", query: "paiement électronique monnaie électronique transfert établissement", triggers: ["paiement", "mobile money", "monnaie electronique", "transfert d'argent", "wallet", "portefeuille"], regulated: true },
  { id: "ecommerce", theme: "Commerce électronique", query: "commerce électronique obligations fournisseur information consommateur contrat en ligne", triggers: ["en ligne", "commerce electronique", "e-commerce", "plateforme", "marketplace", "e-commercants", "site web"] },
  { id: "donnees", theme: "Données personnelles et cybersécurité", query: "données à caractère personnel collecte traitement consentement sécurité", triggers: ["application", "donnees", "suivi", "geolocalisation", "plateforme", "clients", "utilisateurs"] },
  { id: "consommateur", theme: "Protection du consommateur", query: "protection du consommateur obligations professionnel information prix garantie", triggers: [], always: true },
  { id: "concurrence", theme: "Concurrence", query: "concurrence pratiques anticoncurrentielles abus position dominante entente", triggers: ["concurrent", "concurrents", "marche", "leader", "monopole"] },
];

const COMPETITOR_CATEGORIES: Record<string, string[]> = {
  postal: ["Opérateur postal public et sociétés de messagerie express établies", "Livreurs indépendants et moto-taxis (secteur informel)", "Logistique intégrée des grandes plateformes de e-commerce"],
  telecom: ["Opérateurs mobiles titulaires de licences (offres 4G/box)", "Fournisseurs d'accès Internet existants", "Solutions satellitaires grand public"],
  paiement: ["Services de mobile money des opérateurs", "Banques et établissements de microfinance", "Fintechs d'agrégation de paiement"],
  ecommerce: ["Marketplaces régionales et internationales", "Vente via réseaux sociaux et messageries (informel)", "Commerces physiques de proximité"],
  default: ["Solutions informelles existantes (le statu quo)", "Acteurs établis du secteur", "Alternatives internationales accessibles en ligne"],
};

function detectThemes(text: string): Theme[] {
  const picked = THEMES.filter((t) => t.always || t.triggers.some((k) => hasKeyword(text, k)));
  const regulated = picked.filter((t) => t.regulated);
  const others = picked.filter((t) => !t.regulated);
  return [...regulated, ...others].slice(0, 5);
}

/** Indicateurs sectoriels : extraits des publications officielles du corpus (observatoires, rapports, Nouvelles de l'ART). */
async function marketIndicators(company: Company, idea: string) {
  const chunks = (await loadDocumentChunks()).filter((c) => /observatoire|rapport|nouvelle|communiqu/i.test(c.category));
  if (!chunks.length) return { indicators: [], note: "Index des publications absent (npm run index-documents) : aucune donnée de marché disponible." };
  const q = `${company.sectorKeywords.slice(0, 4).join(" ")} ${idea.split(/\s+/).slice(0, 12).join(" ")} marché abonnés chiffre d'affaires parc`;
  const hits = searchDocuments(q, chunks, 3);
  const indicators = hits.map((h) => ({ source: h.source, document: h.title, page: h.page, category: h.category, extrait: h.text.replace(/\s+/g, " ").slice(0, 420) }));
  return {
    indicators,
    note: indicators.length
      ? "Extraits de publications officielles du corpus (ART) : indicateurs SECTORIELS, pas une étude de marché du projet. La taille du marché adressable reste à établir (enquête terrain, données INS, interviews clients)."
      : "Aucune publication du corpus ne renseigne ce marché : taille de marché à établir par une étude terrain. Aucun chiffre n'est avancé.",
  };
}

export async function analyzeIdea(companyId: string, input: Partial<IdeaInput>, ctx: Ctx) {
  const { company, m, data } = await readModule(companyId);
  const idea = (input.idea ?? "").trim() || company.description;
  const full: IdeaInput = { idea, target: input.target?.trim() || undefined, revenueModel: input.revenueModel?.trim() || undefined, competitors: (input.competitors ?? []).filter(Boolean), differentiation: input.differentiation?.trim() || undefined };
  const text = `${company.sector} ${company.sectorKeywords.join(" ")} ${idea} ${full.target ?? ""} ${full.revenueModel ?? ""}`;
  const has = (...k: string[]) => k.some((x) => hasKeyword(text, x));

  // 1. Obstacles réglementaires — article par article (corpus officiel).
  const themes = detectThemes(text);
  const obstacles: RegulatoryTheme[] = [];
  for (const t of themes) obstacles.push(await regulatoryTheme(ctx, t.theme, `${t.query} ${company.sectorKeywords.slice(0, 2).join(" ")}`.trim(), 3));
  const regulatedHits = obstacles.filter((o, i) => themes[i].regulated && o.status !== "non_couvert");

  // 2. Marché et concurrents.
  const market = await marketIndicators(company, idea);
  const competitors: IdeaDiagnostic["competitors"] = (full.competitors ?? []).map((c) => ({ name: c, kind: "declare" as const, detail: "Déclaré par l'entrepreneur" }));
  const web = await webSearch(`${company.sector} ${company.city} Cameroun concurrents startup`, 5);
  for (const r of web.results) competitors.push({ name: r.title, kind: "web", detail: r.description, url: r.url });
  if (web.mode === "demo") {
    const cats = themes.flatMap((t) => COMPETITOR_CATEGORIES[t.id] ?? []);
    for (const c of [...new Set(cats.length ? cats : COMPETITOR_CATEGORIES.default)].slice(0, 4)) competitors.push({ name: c, kind: "categorie", detail: "Catégorie générique à confirmer (recherche web non configurée : BRAVE_SEARCH_API_KEY)" });
  }

  // 3. Forces / faiblesses (règles explicites, pas d'encouragement automatique).
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const hasTarget = Boolean(full.target) || /\b(cible|pour les|aupres des|clients?|e-commercants|menages|entreprises|pme)\b/.test(norm(idea));
  (hasTarget ? strengths : weaknesses).push(hasTarget ? "Cible client identifiée." : "Cible client floue : à qui vendez-vous exactement, et qui paie ?");
  const hasRevenue = Boolean(full.revenueModel) || /\b(commission|abonnement|prix|tarif|marge|frais|forfait|par livraison|par mois)\b/.test(norm(idea));
  (hasRevenue ? strengths : weaknesses).push(hasRevenue ? "Modèle de revenus esquissé." : "Modèle de revenus absent : comment gagnez-vous de l'argent, à quel prix ?");
  const hasDiff = Boolean(full.differentiation) || /\b(contrairement|unique|seul|differen|moins cher|plus rapide|temps reel|innovant)\b/.test(norm(idea));
  (hasDiff ? strengths : weaknesses).push(hasDiff ? "Élément de différenciation énoncé (à prouver sur le terrain)." : "Différenciation non démontrée face aux alternatives existantes.");
  if (!(full.competitors ?? []).length) weaknesses.push("Aucun concurrent déclaré : soit le marché n'existe pas encore, soit l'analyse est incomplète. Le statu quo (solutions informelles) est toujours un concurrent.");
  if (has("clients", "pilote", "utilisateurs", "chiffre d'affaires", "commandes", "revenus") && /\b(\d+|deja|premiers?)\b/.test(norm(idea))) strengths.push("Premiers signaux de traction mentionnés.");
  if (has("mobile money", "paiement mobile", "whatsapp", "smartphone")) strengths.push("S'appuie sur des usages déjà répandus (mobile, mobile money) plutôt que d'en créer de nouveaux.");
  if (regulatedHits.length) weaknesses.push(`Activité réglementée (${regulatedHits.map((o) => o.theme).join(" ; ")}) : un titre ou des obligations sectorielles s'appliquent avant ou pendant l'exploitation — voir les articles cités.`);
  if (has("moto", "motos", "vehicules", "camions", "entrepot", "antennes", "infrastructure", "equipements", "flotte")) weaknesses.push("Intensité capitalistique (véhicules, équipements ou infrastructure) : besoin de financement initial élevé et risque d'immobilisation.");
  const members = data.members.filter((x) => x.companyId === companyId);
  const gaps = skillGaps(company, members, m.memberSkills.filter((s) => s.companyId === companyId));
  const criticalGaps = gaps.gaps.filter((g) => g.critical);
  if (members.length <= 1) weaknesses.push("Fondateur seul : risque d'exécution et de dépendance à une personne.");
  if (criticalGaps.length) weaknesses.push(`Compétences critiques manquantes dans l'équipe : ${criticalGaps.map((g) => g.label).join(", ")}.`);
  else if (gaps.declaredMembers) strengths.push("Les compétences critiques identifiées sont couvertes par l'équipe déclarée.");
  if (idea.length < 80) weaknesses.push("Description trop courte pour un diagnostic fiable : détaillez problème, cible, offre, prix.");

  let score = 50 + strengths.length * 7 - weaknesses.length * 7 - (regulatedHits.length ? 5 : 0);
  score = Math.max(5, Math.min(85, score));
  const verdict: IdeaDiagnostic["verdict"] = score < 40 ? "fragile" : score < 65 ? "a_consolider" : "prometteuse_sous_conditions";
  const verdictLabel = { fragile: "Fragile en l'état : des problèmes structurels sont à résoudre avant d'investir.", a_consolider: "À consolider : le projet est plausible mais plusieurs hypothèses clés ne sont pas démontrées.", prometteuse_sous_conditions: "Prometteuse sous conditions : les conditions de succès ci-dessous restent à remplir." }[verdict];

  // 4. Conditions de succès et pivots.
  const successConditions = [
    "Valider la disposition à payer auprès d'au moins 10 clients cibles avant d'investir lourdement.",
    ...(regulatedHits.length ? [`Obtenir les titres et respecter les obligations des textes cités (${regulatedHits.flatMap((o) => o.articles.slice(0, 2).map((a) => `${a.document}${a.article !== "—" ? `, art. ${a.article}` : ""}`)).slice(0, 3).join(" ; ")}).`] : []),
    ...(criticalGaps.length ? [`Compléter l'équipe : ${criticalGaps.map((g) => g.label).join(", ")} (voir Équipe & recrutement).`] : []),
    "Disposer d'un plan de trésorerie sur 12 mois et d'indicateurs suivis chaque semaine (coût d'acquisition, marge par unité, rétention).",
  ];
  const pivots: string[] = [];
  if (regulatedHits.length) pivots.push("Démarrer en partenariat ou en sous-traitance avec un acteur déjà titulaire des autorisations, le temps d'obtenir votre propre titre (à valider juridiquement).");
  if (weaknesses.some((w) => w.startsWith("Intensité"))) pivots.push("Modèle « asset-light » : agréger des flottes ou équipements existants (location, partenaires) au lieu de les acheter.");
  if (!hasRevenue) pivots.push("Tester un abonnement B2B mensuel avec quelques clients pilotes plutôt qu'un modèle à la transaction.");
  if (!hasDiff || !(full.competitors ?? []).length) pivots.push("Se spécialiser sur une niche (un secteur client, un quartier, un type de produit) où vous pouvez être nettement meilleur.");
  if (!hasTarget) pivots.push("Choisir un segment de 50 premiers clients joignables et construire l'offre pour eux seuls.");
  if (!pivots.length) pivots.push("Pas de pivot impératif identifié : concentrez-vous sur la preuve des conditions de succès.");

  const diagnostic: IdeaDiagnostic = { id: newId("idea"), companyId, input: full, score, verdict, verdictLabel, strengths, weaknesses, obstacles, market, competitors, competitorsMode: web.mode, successConditions, pivots, createdAt: nowIso() };
  await withModule(companyId, (mod) => {
    mod.ideas.unshift(diagnostic);
    mod.ideas = [...mod.ideas.filter((x) => x.companyId === companyId).slice(0, 10), ...mod.ideas.filter((x) => x.companyId !== companyId)];
  });
  return diagnostic;
}

/** Diagnostic en Markdown (pour Documents et le dossier de financement). */
export function ideaMarkdown(d: IdeaDiagnostic, companyName: string) {
  const lines = [
    `# Diagnostic de l'idée — ${companyName}`,
    "",
    `> ${d.verdictLabel} (indice ${d.score}/100 — indicateur de maturité du dossier, ce n'est pas une validation).`,
    "",
    "## Idée analysée",
    d.input.idea,
    "",
    "## Forces",
    ...d.strengths.map((s) => `- ${s}`),
    "",
    "## Faiblesses",
    ...d.weaknesses.map((s) => `- ${s}`),
    "",
    "## Obstacles réglementaires (corpus officiel, article par article)",
  ];
  for (const o of d.obstacles) {
    lines.push("", `### ${o.theme}`, o.status === "non_couvert" ? "> ⚠️ Non couvert par le corpus officiel : aucune règle n'est affirmée." : `> ${o.label}`);
    for (const a of o.articles) lines.push(`- [${a.source}] ${a.document} — p. ${a.page}${a.article !== "—" ? `, art. ${a.article}` : ""} : « ${a.extrait} »`);
  }
  lines.push("", "## Marché", d.market.note, ...d.market.indicators.map((i) => `- ${i.document}, p. ${i.page} : « ${i.extrait.slice(0, 240)}… »`));
  lines.push("", `## Concurrents (${d.competitorsMode === "web" ? "recherche web réelle" : "mode démo : catégories génériques à confirmer"})`, ...d.competitors.map((c) => `- ${c.name}${c.url ? ` (${c.url})` : ""} — ${c.detail}`));
  lines.push("", "## Conditions de succès", ...d.successConditions.map((s) => `- ${s}`), "", "## Pivots possibles", ...d.pivots.map((s) => `- ${s}`));
  lines.push("", "_Diagnostic généré automatiquement à partir des informations fournies et du corpus officiel ; à confronter au terrain._");
  return lines.join("\n");
}
