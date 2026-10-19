import { AID_PROGRAMS, DEMO_BANNER, DEMO_NOTICE, NEWS, PROFILES, type NewsEffect, type ProfileId } from "./seed";

/**
 * Économie citoyenne (DÉMO) : traduit une actualité économique (fictive) en conseils pratiques par profil.
 * Règles explicites (effet → conseil), pas de prévision. Les programmes d'aide sont des EXEMPLES.
 * Les références juridiques sont ajoutées par l'appelant à partir du corpus officiel (requête `legalQuery`).
 */

const ADVICE: Record<NewsEffect, Partial<Record<ProfileId, string[]>> & { all: string[]; explain: string }> = {
  prix_alimentaires: {
    explain: "Quand les prix alimentaires montent, la part du budget consacrée à manger augmente et il reste moins pour le reste.",
    all: ["Comparez les prix de 2 ou 3 marchés avant les gros achats."],
    agriculteur: ["Vos produits se vendent plus cher : étalez vos ventes au lieu de tout vendre à la récolte.", "Gardez la consommation de la famille et les semences avant de vendre."],
    famille: ["Planifiez les repas de la semaine et achetez en conséquence.", "Remplacez une partie des produits importés par des produits locaux de saison.", "Achetez en gros à plusieurs familles pour obtenir de meilleurs prix."],
    artisan: ["Revoyez vos prix de vente si vos coûts augmentent, en prévenant vos clients."],
    commercant: ["Affichez vos prix et évitez les hausses brutales : la confiance des clients se perd vite."],
    transporteur: ["La demande de transport de marchandises peut augmenter : proposez des tournées groupées."],
  },
  prix_importes: {
    explain: "Les produits importés coûtent plus cher quand le dollar ou les coûts de transport international montent.",
    all: ["Cherchez des équivalents locaux aux produits importés."],
    artisan: ["Demandez des devis à plusieurs fournisseurs pour vos matières premières importées.", "Achetez par petites quantités régulières plutôt qu'un gros stock coûteux."],
    commercant: ["Renouvelez votre stock progressivement : le prix d'achat peut encore bouger."],
    famille: ["Reportez les achats importés non urgents."],
  },
  fcfa_apprecie: {
    explain: "Quand le FCFA s'apprécie, un dollar coûte moins de FCFA : les importations payées en dollars baissent, mais les ventes à l'export rapportent moins de FCFA.",
    all: [],
    agriculteur: ["Si vous vendez une culture d'exportation, le prix payé en FCFA peut baisser : comparez les acheteurs et envisagez le stockage collectif.", "Concentrez une partie de la production sur le vivrier vendu localement, moins exposé au change."],
    famille: ["Certains produits importés peuvent devenir moins chers : c'est le moment d'acheter un équipement prévu."],
    artisan: ["Vos intrants importés peuvent baisser : renégociez avec vos fournisseurs."],
    commercant: ["Vos prix d'achat de produits importés peuvent baisser : répercutez-le pour rester compétitif."],
  },
  fcfa_deprecie: {
    explain: "Quand le FCFA se déprécie, il faut plus de FCFA pour un dollar : les importations en dollars renchérissent, les exportations rapportent plus.",
    all: [],
    agriculteur: ["Les cultures d'exportation peuvent mieux se vendre en FCFA : renseignez-vous sur les prix d'achat."],
    famille: ["Anticipez la hausse des produits importés dans votre budget."],
    artisan: ["Sécurisez vos prix d'achat d'intrants importés auprès de vos fournisseurs."],
  },
  carburant: {
    explain: "Le carburant fait monter le coût du transport, qui se répercute sur presque tous les prix des marchés.",
    all: ["Regroupez vos déplacements."],
    transporteur: ["Recalculez votre prix de course avec le nouveau coût du carburant et affichez-le clairement.", "Entretenez votre moteur : un moteur bien réglé consomme moins."],
    agriculteur: ["Vendez en groupe pour partager le coût du transport jusqu'au marché."],
    famille: ["Prévoyez une hausse du budget transport et des prix des produits venus de loin."],
    commercant: ["Mutualisez les livraisons avec d'autres commerçants."],
  },
  credit: {
    explain: "Quand le crédit est plus cher, emprunter coûte plus : chaque prêt doit rapporter davantage pour être utile.",
    all: ["Comparez le coût total d'un crédit (taux, frais, assurance) avant de signer."],
    artisan: ["Privilégiez les programmes de micro-crédit à taux réduit (voir aides) et les tontines."],
    commercant: ["Réduisez votre stock dormant pour moins dépendre du crédit."],
    agriculteur: ["Les crédits de campagne doivent être remboursés après la récolte : calculez prudemment."],
  },
  aide_publique: {
    explain: "Un programme public peut réduire vos coûts ou financer un équipement : vérifiez vos conditions d'éligibilité.",
    all: ["Vérifiez les conditions auprès de l'administration avant tout paiement : les démarches publiques ne passent pas par des intermédiaires payants non officiels."],
    artisan: ["Préparez vos documents (identité, preuve d'activité) pour constituer le dossier rapidement."],
    agriculteur: ["Rejoignez une coopérative : beaucoup de programmes passent par les groupements."],
  },
};

/** Requête au corpus officiel par profil : seules les sources réellement trouvées seront citées. */
export const LEGAL_QUERY: Record<ProfileId, string> = {
  agriculteur: "protection du consommateur droits du consommateur information prix",
  famille: "protection du consommateur droits du consommateur information prix",
  artisan: "protection du consommateur obligations du professionnel information prix garantie",
  commercant: "protection du consommateur affichage des prix pratiques commerciales abusives",
  transporteur: "protection du consommateur prix du service information usager",
};

export type CitizenAdvice = {
  banner: string;
  notice: string;
  isDemo: true;
  profile: { id: ProfileId; label: string; description: string };
  news: { id: string; title: string; summary: string; explain: string[]; isExample: true }[];
  conseils: string[];
  aides: { id: string; name: string; benefit: string; eligibility: string; howTo: string; isExample: true }[];
  legalQuery: string;
};

export function citizenAdvice(profileId: string, newsIds?: string[]): CitizenAdvice {
  const profile = PROFILES.find((p) => p.id === profileId) ?? PROFILES[1];
  const items = NEWS.filter((n) => !newsIds?.length || newsIds.includes(n.id));
  const conseils = new Set<string>();
  for (const n of items) for (const e of n.effects) for (const a of [...(ADVICE[e][profile.id] ?? []), ...ADVICE[e].all]) conseils.add(a);
  return {
    banner: DEMO_BANNER,
    notice: DEMO_NOTICE,
    isDemo: true,
    profile: { id: profile.id, label: profile.label, description: profile.description },
    news: items.map((n) => ({ id: n.id, title: n.title, summary: n.summary, explain: n.effects.map((e) => ADVICE[e].explain), isExample: n.isExample })),
    conseils: [...conseils],
    aides: AID_PROGRAMS.filter((a) => a.profiles.includes(profile.id)).map(({ profiles: _p, ...a }) => a),
    legalQuery: LEGAL_QUERY[profile.id],
  };
}
