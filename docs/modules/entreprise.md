# Module Entreprise (niveau 2) — Co-founder

Équipe « entreprise ». Six onglets du niveau **Entreprise** (IDs réservés de `module-catalog`) :
`data` (Données), `finance` (Finances), `intel` (Veille & appels d'offres), `risk` (Risques), `due-diligence`, `data-room`.
Offre payante : toutes les routes passent par `handlePaid` + `assertCompanyAccess`. Aucun outil n'envoie quoi que ce soit à un tiers.

## Où est le code

| Quoi | Où |
|---|---|
| Logique métier | `lib/modules/entreprise/` (`service.ts`, `analytics.ts`, `finance.ts`, `insights.ts`, `risk.ts`, `duediligence.ts`, `dataroom.ts`, `reports.ts`, `legal.ts`, `sources.ts`) |
| Lecteurs/écrivains sans dépendance | `csv.ts`, `xlsx.ts` (OOXML), `zip.ts` (ZIP + CRC32), `pdf.ts` (PDF Helvetica) |
| Seed « exemple » | `seed.ts` (co_kmerlog, co_afritel ; tout est marqué `isExample` / « (exemple) ») |
| Agent | `agent.ts` (`agentModule`), `tools.ts` (12 outils), `demo.ts` (mode démo sans clé IA) |
| UI | `components/modules/entreprise/*Panel.tsx` (+ `EntreprisePanels.tsx`, `entreprise.css`) |
| API | `app/api/entreprise/route.ts`, `app/api/entreprise/export/route.ts` |
| Tests | `tests/entreprise.test.ts` |

Données persistées dans `data.modules.entreprise` (`moduleState`) : `datasets`, `budgets`, `settings`, `counterparties`, `reports`, chaque élément avec `companyId`.
Entreprises de démo : le seed d'exemple est recalculé à la volée (non persisté) et s'ajoute aux imports de l'utilisateur ; entreprises réelles : uniquement leurs imports (bouton « Charger un jeu d'exemple » pour essayer, données marquées).

## 1. Données (`data`)
- Import **CSV** (séparateur détecté, `;` `,` tab) et **Excel .xlsx** (une table par feuille), 5 Mo / 20 000 lignes max ; `.xls` refusé (à convertir).
- Structuration automatique : domaine (ventes / finances / RH / clients) et colonnes reconnues (date, montant, débit/crédit combinés en montant signé, client, catégorie, salaire, encours, retard…), dates FR/ISO/série Excel, nombres FR.
- Tableaux de bord auto par domaine (KPI, séries mensuelles, répartitions) et **détection d'anomalies** (médiane/MAD, Tukey, doublons, valeurs négatives, mois manquants, salaires atypiques, encours en retard).
- **Rapport exécutif hebdomadaire** : bouton, outil agent, et point d'entrée pour la future routine planifiée :
  `generateWeeklyReport(companyId, { trigger: "routine" })` (`lib/modules/entreprise/reports.ts`) → Document + historique + journal (acteur `routine`).

## 2. Tableau financier (`finance`)
Budget vs réel, revenus/dépenses, trésorerie historique et **prévisionnelle 6 mois** (mois en cours proratisé), autonomie (runway), alertes de risque de trésorerie (seuil de sécurité paramétrable).
Exports **investisseurs / banque / fisc** en PDF, Markdown ou ZIP (PDF + CSV). L'export fisc **ne calcule aucun impôt** : il liste les obligations trouvées dans le corpus officiel (citées document/page/article, filtre de pertinence) ; les échéances sans texte sont marquées « exemple, non officiel ».

## 3. Veille & appels d'offres (`intel`) et Risques (`risk`)
- Veille sectorielle filtrée par le profil (secteur + mots-clés) : réutilise la veille réglementaire du cœur (`regulatoryWatch`) et les publications du régulateur présentes dans le corpus ; signaux de marché = **exemple** ; indicateurs macro **réels** (Banque mondiale).
- Alertes d'appels d'offres : **source réelle** Banque mondiale (avis de passation de marchés des projets au Cameroun, avis d'attribution exclus), archives ART du corpus, exemples fictifs marqués, liens vers les portails nationaux ARMP / COLEPS (pas d'API publique vérifiée → liens seulement).
- Profil de risque 5 axes (change, crédit client, opérationnel, réglementaire, liquidité) avec facteurs, stratégies de couverture et point juridique cité.
- Simulation de stress : 6 scénarios types + scénario personnalisé (ventes, coûts, change, retards de paiement, perte du premier client).

## 4. Due diligence (`due-diligence`)
Contreparties : exemples, annuaire fournisseurs du workspace, ajouts manuels. Fiche de signaux (score, verdict, signaux sourcés, informations manquantes, limites) + **checklist juridique citée** (registre du commerce, concurrence, données personnelles, contrat électronique, consommateur, homologation, capital, blanchiment… selon le type) ; « non couvert par le corpus » quand aucun texte pertinent n'est trouvé. Aucune consultation de registre officiel (RCCM) : pas de source publique vérifiée.

## 5. Data room (`data-room`)
Sections statuts, pacte, conformité, chiffres, business plan, risques, avec pièces du workspace, points juridiques cités et **score de complétude** détaillé. Export **ZIP** (index + pièces + CSV) ou **PDF**.

## Outils de l'agent (`entreprise_*`)
`entreprise_importer_donnees`, `entreprise_tableau_de_bord_donnees`, `entreprise_detecter_anomalies`, `entreprise_rapport_hebdomadaire`, `entreprise_tableau_financier`, `entreprise_exporter_rapport_financier`, `entreprise_veille_sectorielle`, `entreprise_alertes_appels_offres`, `entreprise_profil_risque`, `entreprise_simulation_stress`, `entreprise_due_diligence`, `entreprise_generer_data_room`.
Mode démo : une intention `entreprise` (regex) exécute les intentions détectées ; `filterCoreIntents` (appelé par `detectIntents`) évite qu'une due diligence ou une data room déclenche un devis, un email ou un document non demandés.

## API
- `GET /api/entreprise?companyId=…&view=data|finance|veille|appels|risques|stress|contreparties|dataroom` (`&keywords=` pour veille/appels)
- `POST /api/entreprise` `{ companyId, action }` : `import` (`fileName`, `text` ou `base64`), `supprimer_table`, `charger_exemple`, `parametres`, `budget`, `rapport`, `contrepartie`, `due_diligence` (`id` ou `name`), `stress`
- `GET /api/entreprise/export?companyId=…&type=dataroom|finance|rapport|dd&format=pdf|md|zip|csv` (`cible=investisseurs|banque|fisc`, `id=`)

## Réel vs seedé
| Élément | Statut |
|---|---|
| Imports CSV/xlsx, tableaux de bord, anomalies, trésorerie, stress, exports, data room | Réel (calculé sur les données importées) |
| Jeux de données, budgets, contreparties, signaux de marché, appels d'offres d'exemple des entreprises de démo | **Exemple** (fictif, marqué) |
| Avis de marchés et indicateurs macro (inflation, change XAF/USD, PIB) | **Réel** : API publiques Banque mondiale, sans clé |
| ARMP / COLEPS | Liens officiels uniquement (pas d'API publique vérifiée) |
| Points juridiques / obligations fiscales | Corpus officiel cité, sinon « non couvert » / « exemple » |

## Variables d'environnement (aucune obligatoire)
- `ENTREPRISE_LIVE_SOURCES` : `off` désactive les appels Banque mondiale (bascule sur exemples + liens, marqué « indisponible »).
- `ENTREPRISE_SOURCES_TIMEOUT_MS` : délai des appels publics (défaut 12000) ; cache mémoire 1 h.

## Limites connues
- Pas de lecture `.xls` (ancien format binaire) ni de PDF bancaires.
- La prévision de trésorerie est une extrapolation (moyennes récentes + budget), pas un modèle financier.
- Due diligence sans registre officiel ni centrale de risques : signaux limités aux données disponibles.
