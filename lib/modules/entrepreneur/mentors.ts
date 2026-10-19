/**
 * Réseau de mentors — PROFILS D'EXEMPLE (fictifs). Aucun mentor réel n'est listé tant qu'un partenariat
 * n'a pas été conclu ; les adresses utilisent le domaine réservé example.com (RFC 2606).
 */
export type Mentor = {
  id: string;
  name: string;
  headline: string;
  location: string;
  diaspora: boolean;
  sectors: string[];
  skills: string[];
  languages: string[];
  availability: string;
  email: string;
  isExample: true;
};

export const SEED_MENTORS: Mentor[] = [
  { id: "men_logi", name: "Mireille Ekambi (exemple)", headline: "Ex-directrice des opérations d'un réseau de livraison urbaine", location: "Douala", diaspora: false, sectors: ["logistique", "livraison", "transport", "commerce électronique"], skills: ["opérations", "gestion de flotte", "recrutement", "unit economics"], languages: ["français", "anglais"], availability: "2 h par mois", email: "mireille.ekambi@mentors.example.com", isExample: true },
  { id: "men_fin", name: "Jean-Paul Ndzana (exemple)", headline: "Ancien analyste en capital-risque, accompagne les levées d'amorçage", location: "Paris (diaspora)", diaspora: true, sectors: ["fintech", "finance", "mobile money", "investissement"], skills: ["levée de fonds", "finance", "modèle financier", "pitch"], languages: ["français", "anglais"], availability: "1 h toutes les deux semaines", email: "jp.ndzana@mentors.example.com", isExample: true },
  { id: "men_tel", name: "Aïcha Bello (exemple)", headline: "Ingénieure réseaux, ex-opératrice télécom", location: "Yaoundé", diaspora: false, sectors: ["télécommunications", "internet", "communications électroniques"], skills: ["ingénierie réseau", "réglementaire", "licences", "infrastructure"], languages: ["français", "anglais", "fulfulde"], availability: "2 h par mois", email: "aicha.bello@mentors.example.com", isExample: true },
  { id: "men_tech", name: "Kevin Fon (exemple)", headline: "CTO en série, applications mobiles à grande échelle", location: "Montréal (diaspora)", diaspora: true, sectors: ["numérique", "logiciel", "commerce électronique", "fintech"], skills: ["technique", "produit", "développement mobile", "recrutement tech"], languages: ["anglais", "français"], availability: "1 h par semaine", email: "kevin.fon@mentors.example.com", isExample: true },
  { id: "men_mkt", name: "Sandrine Mbappe (exemple)", headline: "Directrice marketing grande consommation", location: "Abidjan", diaspora: false, sectors: ["commerce", "distribution", "cosmétiques", "commerce électronique"], skills: ["marketing", "commercial", "marque", "acquisition clients"], languages: ["français"], availability: "2 h par mois", email: "sandrine.mbappe@mentors.example.com", isExample: true },
  { id: "men_jur", name: "Me Paul Tchoua (exemple)", headline: "Juriste d'affaires, structuration de start-ups", location: "Douala", diaspora: false, sectors: ["juridique", "tous secteurs"], skills: ["juridique", "conformité", "pacte d'associés", "gouvernance"], languages: ["français", "anglais"], availability: "1 h par mois", email: "paul.tchoua@mentors.example.com", isExample: true },
  { id: "men_agri", name: "Grace Nkeng (exemple)", headline: "Fondatrice d'une agritech, chaînes d'approvisionnement", location: "Bamenda", diaspora: false, sectors: ["agriculture", "agritech", "agroalimentaire", "logistique"], skills: ["opérations", "approvisionnement", "impact", "subventions"], languages: ["anglais", "français", "pidgin"], availability: "2 h par mois", email: "grace.nkeng@mentors.example.com", isExample: true },
  { id: "men_rh", name: "Olivier Essomba (exemple)", headline: "DRH, construction d'équipes de 5 à 200 personnes", location: "Londres (diaspora)", diaspora: true, sectors: ["tous secteurs", "services"], skills: ["recrutement", "rh", "culture d'entreprise", "management"], languages: ["français", "anglais"], availability: "1 h toutes les deux semaines", email: "olivier.essomba@mentors.example.com", isExample: true },
];
