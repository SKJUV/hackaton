import { groundQuery, type Grounding, type GroundingStatus } from "@/lib/legal/grounding";
import type { CounterpartyKind } from "./types";

/**
 * Ancrage juridique du module : chaque point (obligation fiscale, contrôle de due diligence,
 * risque réglementaire) est recherché dans le corpus officiel. Résultat honnête :
 * « fondé » / « partiel » avec document-page-articles, ou « non couvert par le corpus ».
 */

export type CitedPoint = {
  id: string;
  label: string;
  query: string;
  status: GroundingStatus;
  statusLabel: string;
  sources: { document: string; page: number; articles: string[]; file: string; isExample: boolean; excerpt: string }[];
  /** true si seul un texte d'EXEMPLE (non officiel) répond. */
  exampleOnly: boolean;
};

const cache = new Map<string, { at: number; g: Grounding }>();

export async function ground(query: string, limit = 3): Promise<Grounding> {
  const hit = cache.get(`${limit}|${query}`);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.g;
  const g = await groundQuery(query, limit);
  cache.set(`${limit}|${query}`, { at: Date.now(), g });
  return g;
}

const fold = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * @param mustInclude Contrôle de pertinence : un extrait officiel n'est retenu que s'il contient ce motif
 * (ex. « valeur ajoutee » pour la TVA). Évite de présenter comme « couvert » un texte qui ne traite pas le sujet.
 */
export async function citePoint(id: string, label: string, query: string, limit = 3, mustInclude?: RegExp): Promise<CitedPoint> {
  const g = await ground(query, mustInclude ? Math.max(limit, 6) : limit);
  const official = g.citations.filter((c) => !c.isExample && (!mustInclude || mustInclude.test(fold(c.excerpt))));
  const examples = g.citations.filter((c) => c.isExample);
  const covered = g.status !== "non_couvert" && official.length > 0;
  const pick = covered ? official.slice(0, 2) : examples.slice(0, 1);
  // Si le meilleur extrait du moteur a été écarté (hors sujet), la couverture n'est que partielle.
  const topOfficial = g.citations.find((c) => !c.isExample);
  const status: CitedPoint["status"] = !covered ? "non_couvert" : topOfficial && official[0] !== topOfficial ? "partiel" : g.status;
  const label0 = (c: (typeof official)[number]) => `${c.legalTitle ?? c.title}, p. ${c.page}${c.articles.length ? `, art. ${c.articles.slice(0, 2).join(", ")}` : ""}`;
  return {
    id,
    label,
    query,
    status,
    statusLabel: covered ? `${status === "fonde" ? "Fondé sur" : "Partiellement couvert"} : ${label0(official[0])}` : examples.length ? "Non couvert par le corpus officiel — texte d'EXEMPLE seulement" : "Non couvert par le corpus officiel",
    sources: pick.map((c) => ({ document: c.legalTitle ?? c.title, page: c.page, articles: c.articles, file: c.file, isExample: Boolean(c.isExample), excerpt: c.excerpt.slice(0, 320) })),
    exampleOnly: !covered && examples.length > 0,
  };
}

export function citedMarkdown(p: CitedPoint): string {
  if (p.status === "non_couvert")
    return `- **${p.label}** — ⚠️ ${p.statusLabel}.${p.exampleOnly && p.sources[0] ? ` (Texte d'exemple, non officiel : ${p.sources[0].document}.)` : ""} À faire vérifier par un professionnel.`;
  return `- **${p.label}** — ${p.statusLabel}${p.status === "partiel" ? " (couverture partielle)" : ""}\n${p.sources.map((s) => `  - ${s.document}, page ${s.page}${s.articles.length ? `, art. ${s.articles.slice(0, 3).join(", ")}` : ""} : « ${s.excerpt.slice(0, 200).trim()}… »`).join("\n")}`;
}

/** Obligations fiscales et parafiscales recherchées dans le corpus. */
type Topic = { id: string; label: string; query: string; must?: RegExp };

export const FISCAL_TOPICS: Topic[] = [
  { id: "fisc_declaration", label: "Déclaration et paiement des impôts et taxes", query: "déclaration fiscale impôts taxes paiement mensuel administration fiscale", must: /impot|fiscal/ },
  { id: "fisc_tva", label: "Taxe sur la valeur ajoutée (TVA)", query: "taxe sur la valeur ajoutée TVA collectée déductible", must: /valeur ajoutee|\btva\b/ },
  { id: "fisc_etats", label: "États financiers et déclaration statistique et fiscale annuelle", query: "états financiers annuels déclaration statistique fiscale exercice", must: /etats financiers|declaration statistique/ },
  { id: "fisc_redevance", label: "Redevances et contributions sectorielles (régulation)", query: "redevances contributions droits frais chiffre d'affaires opérateurs agence de régulation", must: /redevance|contribution/ },
];

const COMMON_DD: Topic[] = [
  { id: "dd_existence", label: "Existence légale et immatriculation de la contrepartie", query: "immatriculation registre du commerce et du crédit mobilier société personne morale", must: /registre du commerce/ },
  { id: "dd_concurrence", label: "Pratiques anticoncurrentielles (ententes, abus de position dominante)", query: "pratiques anticoncurrentielles ententes abus de position dominante", must: /concurrence|position dominante|entente/ },
  { id: "dd_donnees", label: "Protection des données personnelles échangées", query: "protection des données à caractère personnel confidentialité traitement", must: /donnees|caractere personnel|vie privee/ },
];

const KIND_DD: Record<CounterpartyKind, Topic[]> = {
  fournisseur: [
    { id: "dd_homologation", label: "Homologation / conformité des équipements fournis", query: "homologation des équipements terminaux conformité certificat", must: /homologation/ },
    { id: "dd_garantie", label: "Garantie et conformité des produits", query: "garantie conformité des produits obligations du vendeur consommateur", must: /garantie/ },
  ],
  client: [
    { id: "dd_contrat_electronique", label: "Contrat et preuve électroniques (commandes en ligne)", query: "contrat électronique écrit sous forme électronique preuve commerce électronique", must: /electronique/ },
    { id: "dd_consommateur", label: "Droits du consommateur (si client particulier)", query: "protection du consommateur droits information prix", must: /consommateur/ },
  ],
  partenaire: [
    { id: "dd_licence", label: "Titre d'exploitation du partenaire (licence, autorisation, agrément)", query: "licence autorisation exploitation réseau opérateur titre agrément", must: /licence|autorisation|agrement|concession/ },
    { id: "dd_interconnexion", label: "Accords techniques et partage d'infrastructures", query: "interconnexion accès partage d'infrastructures convention opérateurs", must: /interconnexion|partage/ },
  ],
  investisseur: [
    { id: "dd_capital", label: "Entrée au capital, droits des associés et pacte", query: "cession de parts sociales associés capital social pacte", must: /parts sociales|pacte d.associes|cession de parts/ },
    { id: "dd_fonds", label: "Origine des fonds (lutte contre le blanchiment)", query: "blanchiment de capitaux origine des fonds financement du terrorisme", must: /blanchiment/ },
  ],
};

export async function legalChecklist(kind: CounterpartyKind): Promise<CitedPoint[]> {
  return Promise.all([...COMMON_DD, ...KIND_DD[kind]].map((t) => citePoint(t.id, t.label, t.query, 3, t.must)));
}

export async function fiscalObligations(): Promise<CitedPoint[]> {
  return Promise.all(FISCAL_TOPICS.map((t) => citePoint(t.id, t.label, t.query, 3, t.must)));
}
