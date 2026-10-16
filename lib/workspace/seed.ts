import type {
  ChecklistStep,
  Company,
  Obligation,
  Supplier,
  WorkspaceData,
} from "./types";

/**
 * SEED DE DÉMONSTRATION — toutes les entités ci-dessous sont fictives.
 * Les adresses email utilisent le domaine réservé example.com (RFC 2606) :
 * aucun message ne peut atteindre un vrai fournisseur.
 */

const iso = (d: Date) => d.toISOString();
function inDays(days: number, base = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function nextDayOfMonth(day: number, monthOffset = 0): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, day, 9, 0, 0);
  if (d < now) d.setMonth(d.getMonth() + 1);
  return d;
}

export const SEED_SUPPLIERS: Supplier[] = [
  { id: "sup_logi1", name: "Trans-Wouri Express (exemple)", category: "Transport & logistique", services: ["livraison urbaine", "motos de livraison", "colis"], city: "Douala", email: "devis@trans-wouri.example.com", phone: "+237 6XX XX XX 01", rating: 4.4, description: "Flotte de 40 motos et 6 fourgonnettes, couverture Douala/Yaoundé.", isExample: true },
  { id: "sup_moto1", name: "Douala Moto Distribution (exemple)", category: "Véhicules & équipements", services: ["motos de livraison", "pièces détachées", "entretien"], city: "Douala", email: "pro@douala-moto.example.com", phone: "+237 6XX XX XX 13", rating: 4.3, description: "Concessionnaire motos 125 cc, contrats d'entretien flotte.", isExample: true },
  { id: "sup_moto2", name: "Yassa Motors (exemple)", category: "Véhicules & équipements", services: ["motos", "tricycles de livraison", "financement"], city: "Douala", email: "flottes@yassa-motors.example.com", phone: "+237 6XX XX XX 14", rating: 4.0, description: "Motos et tricycles cargo, location-vente pour flottes.", isExample: true },
  { id: "sup_logi2", name: "Sanaga Fret (exemple)", category: "Transport & logistique", services: ["transport inter-urbain", "entreposage"], city: "Edéa", email: "commercial@sanaga-fret.example.com", phone: "+237 6XX XX XX 02", rating: 4.0, description: "Entrepôts sous douane et transport poids lourds.", isExample: true },
  { id: "sup_it1", name: "Akwa Digital Services (exemple)", category: "Informatique & télécoms", services: ["développement web", "application mobile", "hébergement"], city: "Douala", email: "projets@akwa-digital.example.com", phone: "+237 6XX XX XX 03", rating: 4.6, description: "Studio de développement, SLA hébergement 99,9 %.", isExample: true },
  { id: "sup_it2", name: "Mfoundi Network (exemple)", category: "Informatique & télécoms", services: ["fibre optique", "installation réseau", "antennes"], city: "Yaoundé", email: "devis@mfoundi-network.example.com", phone: "+237 6XX XX XX 04", rating: 4.2, description: "Installateur réseau et infrastructures passives.", isExample: true },
  { id: "sup_it3", name: "Bonapriso Hardware (exemple)", category: "Informatique & télécoms", services: ["ordinateurs", "smartphones", "terminaux"], city: "Douala", email: "ventes@bonapriso-hw.example.com", phone: "+237 6XX XX XX 05", rating: 3.9, description: "Distributeur de matériel informatique et terminaux.", isExample: true },
  { id: "sup_jur1", name: "Cabinet Ndoumbe & Associés (exemple)", category: "Juridique & comptable", services: ["rédaction de statuts", "conseil juridique", "contrats"], city: "Douala", email: "contact@ndoumbe-avocats.example.com", phone: "+237 6XX XX XX 06", rating: 4.8, description: "Droit des affaires, accompagnement de startups.", isExample: true },
  { id: "sup_jur2", name: "Fiduciaire du Littoral (exemple)", category: "Juridique & comptable", services: ["comptabilité", "déclarations fiscales", "paie"], city: "Douala", email: "bonjour@fiduciaire-littoral.example.com", phone: "+237 6XX XX XX 07", rating: 4.3, description: "Expertise comptable, tenue et déclarations mensuelles.", isExample: true },
  { id: "sup_mkt1", name: "Bali Creative Studio (exemple)", category: "Marketing & communication", services: ["identité visuelle", "réseaux sociaux", "impression"], city: "Douala", email: "hello@bali-creative.example.com", phone: "+237 6XX XX XX 08", rating: 4.5, description: "Branding, campagnes digitales et supports imprimés.", isExample: true },
  { id: "sup_imm1", name: "Bonanjo Bureaux Partagés (exemple)", category: "Immobilier & bureaux", services: ["coworking", "domiciliation", "salle de réunion"], city: "Douala", email: "location@bonanjo-office.example.com", phone: "+237 6XX XX XX 09", rating: 4.1, description: "Domiciliation d'entreprise et postes de travail.", isExample: true },
  { id: "sup_fin1", name: "Kamer Microfinance (exemple)", category: "Banque & finance", services: ["compte professionnel", "crédit d'équipement", "mobile money"], city: "Yaoundé", email: "pro@kamer-mf.example.com", phone: "+237 6XX XX XX 10", rating: 3.8, description: "Comptes pro et financements TPE/PME.", isExample: true },
  { id: "sup_ass1", name: "Littoral Assurances (exemple)", category: "Assurance", services: ["responsabilité civile", "flotte automobile", "marchandises transportées"], city: "Douala", email: "entreprises@littoral-assur.example.com", phone: "+237 6XX XX XX 11", rating: 4.0, description: "Assurances professionnelles multirisques.", isExample: true },
  { id: "sup_emb1", name: "Emballages Wouri (exemple)", category: "Fournitures & emballages", services: ["cartons", "sacs de livraison", "étiquettes"], city: "Douala", email: "commandes@emballages-wouri.example.com", phone: "+237 6XX XX XX 12", rating: 4.2, description: "Emballages personnalisés, livraison sous 72 h.", isExample: true },
];

/** Étapes génériques de création — EXEMPLE à confirmer avec le corpus officiel. */
const CHECKLIST_TEMPLATE: Omit<ChecklistStep, "id" | "companyId" | "status" | "updatedAt">[] = [
  { order: 1, title: "Choisir la forme juridique", description: "Comparer entreprise individuelle, SARL, SAS… selon le nombre d'associés, le capital et la responsabilité souhaitée.", authority: "Associés (avec conseil juridique)", documents: ["Pacte d'associés (optionnel)"], isExample: true },
  { order: 2, title: "Rédiger et signer les statuts", description: "Utiliser le générateur de statuts du workspace puis faire valider par un professionnel.", authority: "Associés / notaire si requis", documents: ["Statuts signés", "Liste des souscripteurs"], isExample: true },
  { order: 3, title: "Déposer le capital social", description: "Ouvrir un compte bancaire professionnel et obtenir l'attestation de dépôt des fonds.", authority: "Banque / établissement agréé", documents: ["Attestation de dépôt"], isExample: true },
  { order: 4, title: "Déposer le dossier au guichet unique", description: "Constituer le dossier de création (pièces des dirigeants, statuts, attestation, justificatif de siège).", authority: "Guichet unique de création d'entreprise (à confirmer)", documents: ["Formulaire de création", "Pièces d'identité", "Justificatif de siège"], isExample: true },
  { order: 5, title: "Immatriculation au registre du commerce", description: "Obtenir le numéro d'immatriculation de la société.", authority: "Registre du commerce (à confirmer)", documents: ["Extrait d'immatriculation"], isExample: true },
  { order: 6, title: "Identifiant fiscal", description: "Obtenir l'identifiant fiscal et le régime d'imposition applicable.", authority: "Administration fiscale (à confirmer)", documents: ["Attestation d'immatriculation fiscale"], isExample: true },
  { order: 7, title: "Affiliation sociale employeur", description: "Déclarer l'entreprise comme employeur avant la première embauche.", authority: "Organisme de sécurité sociale (à confirmer)", documents: ["Attestation d'affiliation"], isExample: true },
  { order: 8, title: "Autorisations sectorielles", description: "Vérifier dans le corpus officiel le régime applicable à l'activité (licence, déclaration, agrément, homologation…). Demander à l'agent : « quel régime pour mon activité ? »", authority: "Autorité sectorielle selon le corpus officiel", documents: ["Titre d'exploitation / agrément"], isExample: true },
  { order: 9, title: "Conformité données & commerce en ligne", description: "Si l'activité collecte des données ou vend en ligne, vérifier les obligations dans le corpus (cybersécurité, commerce électronique, consommateur).", authority: "Voir corpus officiel", documents: ["Mentions légales", "Politique de confidentialité"], isExample: true },
];

export function buildChecklist(companyId: string, doneUntil = 0): ChecklistStep[] {
  const now = iso(new Date());
  return CHECKLIST_TEMPLATE.map((step) => ({
    ...step,
    id: `chk_${companyId}_${step.order}`,
    companyId,
    status: step.order <= doneUntil ? "fait" : step.order === doneUntil + 1 ? "en_cours" : "a_faire",
    updatedAt: now,
  }));
}

/** Calendrier d'obligations — EXEMPLE (dates et intitulés à remplacer par les données officielles). */
export function buildObligations(companyId: string, regulated: boolean): Obligation[] {
  const list: Obligation[] = [
    { id: `obl_${companyId}_1`, companyId, title: "Déclaration fiscale mensuelle (exemple)", category: "fiscal", dueDate: iso(nextDayOfMonth(15)), recurrence: "mensuel", description: "Déclaration et paiement des impôts et taxes du mois précédent. Échéance d'exemple : le 15.", done: false, isExample: true },
    { id: `obl_${companyId}_2`, companyId, title: "Déclaration sociale des salaires (exemple)", category: "social", dueDate: iso(nextDayOfMonth(15)), recurrence: "mensuel", description: "Déclaration des salaires et cotisations sociales. Échéance d'exemple.", done: false, isExample: true },
    { id: `obl_${companyId}_3`, companyId, title: "Acompte trimestriel (exemple)", category: "fiscal", dueDate: iso(inDays(40)), recurrence: "trimestriel", description: "Acompte d'impôt sur les bénéfices — échéance d'exemple.", done: false, isExample: true },
    { id: `obl_${companyId}_4`, companyId, title: "Déclaration statistique et fiscale annuelle (exemple)", category: "fiscal", dueDate: iso(inDays(150)), recurrence: "annuel", description: "Dépôt des états financiers annuels — échéance d'exemple.", done: false, isExample: true },
    { id: `obl_${companyId}_5`, companyId, title: "Assemblée générale d'approbation des comptes (exemple)", category: "juridique", dueDate: iso(inDays(170)), recurrence: "annuel", description: "Approbation des comptes et procès-verbal à archiver.", done: false, isExample: true },
  ];
  if (regulated) {
    list.push({ id: `obl_${companyId}_6`, companyId, title: "Redevance / contribution sectorielle annuelle (exemple)", category: "sectoriel", dueDate: iso(inDays(75)), recurrence: "annuel", description: "Les montants et échéances réels figurent dans les textes sectoriels du corpus officiel (ex. arrêté sur les droits, frais et redevances).", done: false, isExample: true });
  }
  return list;
}

export function buildSeed(): WorkspaceData {
  const now = new Date();
  const companies: Company[] = [
    { id: "co_kmerlog", name: "Kmer Logistik (démo)", sector: "Livraison de colis et courrier express", sectorKeywords: ["postal", "colis", "courrier", "livraison", "commerce électronique"], legalForm: "SARL", city: "Douala", country: "Cameroun", stage: "creation", description: "Startup de livraison du dernier kilomètre pour les e-commerçants de Douala, avec suivi en temps réel et paiement mobile money.", capital: 1000000, currency: "XAF", createdAt: iso(inDays(-21, now)), isExample: true },
    { id: "co_afritel", name: "AfriTel Connect (démo)", sector: "Fourniture d'accès à Internet", sectorKeywords: ["internet", "communications électroniques", "fréquences", "licence", "télécommunications"], legalForm: "SAS", city: "Yaoundé", country: "Cameroun", stage: "idee", description: "Projet de fournisseur d'accès Internet sans fil pour les zones périurbaines.", currency: "XAF", createdAt: iso(inDays(-5, now)), isExample: true },
  ];
  const t = iso(now);
  return {
    version: 1,
    companies,
    members: [
      { id: "mem_freddy", companyId: "co_kmerlog", name: "Freddy Choudja", email: "freddy@demo.example.com", role: "proprietaire", createdAt: t },
      { id: "mem_awa", companyId: "co_kmerlog", name: "Awa Mbarga (démo)", email: "awa@demo.example.com", role: "admin", createdAt: t },
      { id: "mem_paul", companyId: "co_kmerlog", name: "Paul Etoa (démo)", email: "paul@demo.example.com", role: "membre", createdAt: t },
      { id: "mem_freddy2", companyId: "co_afritel", name: "Freddy Choudja", email: "freddy@demo.example.com", role: "proprietaire", createdAt: t },
    ],
    documents: [
      { id: "doc_note1", companyId: "co_kmerlog", title: "Note de cadrage (démo)", kind: "note", content: "# Note de cadrage\n\n- Cible : e-commerçants de Douala (Akwa, Bonapriso, Bonamoussadi)\n- Offre : livraison J+0 avec suivi et encaissement mobile money\n- Besoin immédiat : 10 motos, assurance marchandises, application de suivi\n", createdBy: "mem_freddy", createdAt: t, updatedAt: t },
    ],
    tasks: [
      { id: "tsk_1", companyId: "co_kmerlog", title: "Valider le nom commercial", status: "fait", source: "utilisateur", createdAt: t },
      { id: "tsk_2", companyId: "co_kmerlog", title: "Obtenir 3 devis de motos de livraison", status: "en_cours", source: "utilisateur", dueDate: iso(inDays(5, now)), createdAt: t },
    ],
    suppliers: SEED_SUPPLIERS,
    quotes: [],
    emails: [],
    approvals: [],
    activity: [
      { id: "act_seed", companyId: "co_kmerlog", actor: "system", action: "workspace.seed", details: "Workspace de démonstration initialisé (données fictives).", createdAt: t },
    ],
    checklist: [...buildChecklist("co_kmerlog", 2), ...buildChecklist("co_afritel", 0)],
    obligations: [...buildObligations("co_kmerlog", true), ...buildObligations("co_afritel", true)],
    messages: [],
  };
}
