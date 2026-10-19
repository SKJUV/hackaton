# Module « Structure & création » (Fama Legal étendu, équipe fondation)

Onglet **Entrepreneur → Structure & création** (`#structure`) · API `GET/POST /api/structure` (payant, contrôle d'appartenance) · outils agent préfixés `structure_`.

## Fonctions
| Fonction | Service | Outil agent |
| --- | --- | --- |
| **Choix guidé de la structure** : questionnaire (fondateurs, investisseurs, responsabilité, budget, souplesse, mutualisation), classement motivé, éligibilité | `recommendStructure`, `scoreForms` | `structure_recommander` |
| **Décision mémorisée** : forme retenue, mise à jour de la forme juridique, journal `structure.choix` (pour la mémoire) | `chooseStructure` | `structure_choisir` |
| **Simulateur de création** : 2 à 4 formes côte à côte (statuts, capital, comptabilité, fiscal, social, sectoriel), coûts et délais d'**exemple** | `simulateCreation` | `structure_simuler_creation` |
| **Pacte d'associés avec vesting** : répartition validée à 100 %, durée, cliff, acquisition mensuelle ou trimestrielle, good/bad leaver, lock-up, préemption, drag-along et tag-along, calendrier d'acquisition | `generatePacte`, `vestingSchedule` | `structure_generer_pacte` |
| **Guide d'immatriculation** : étapes génériques selon la forme (dépôt du capital seulement si nécessaire), délais d'exemple, tâches optionnelles | `registrationGuide` | `structure_guide_immatriculation` |

Intentions du mode démo (sans clé IA) : « quelle forme juridique… / SARL ou SAS », « pacte d'associés / vesting », « guide d'immatriculation / RCCM », « simuler la création / comparer les formes ».

## Ancrage juridique : ce qui est réel et ce qui est un exemple
- **Chaque critère, étape et document est rattaché au corpus officiel** via `groundQuery`, avec l'indicateur 🟢 fondé / 🟠 partiel / ⚪ non couvert et ses sources (document, page, articles).
- Le pacte et le guide sont enregistrés dans **Documents** avec la section « Fondement juridique (corpus officiel) », l'état `à relire` et l'empreinte des textes cités. Ils profitent ainsi de l'**alerte de changement de loi**.
- ⚠️ **L'Acte uniforme OHADA sur les sociétés commerciales n'est pas dans le corpus indexé.** Les caractéristiques des formes (`lib/modules/structure/catalog.ts`) sont des *repères généraux à confirmer*, affichés comme tels et jamais présentés comme un texte de loi.
- Les coûts et délais sont des **exemples indicatifs** (badge « exemple »). Les clauses du pacte sont des usages contractuels courants, à faire valider par un avocat ou un notaire.

## Données
`data.modules.structure` contient `choices`, `pactes` et `guides`, filtrés par `companyId`. La réinitialisation de la démo conserve les entreprises réelles.

## Tests
`tests/structure.test.ts` couvre :
- le scoring et l'éligibilité ;
- le calcul du vesting et la validation ;
- la recommandation ancrée et la décision mémorisée ;
- le simulateur ;
- le pacte (fondement juridique, cliff, sources) ;
- le guide (tâches, étape capital) ;
- les outils et l'intention démo.

## Performance
Le calcul BM25 est désormais mis en cache par tableau de chunks (`corpusStats` dans `lib/documents.ts`). Les résultats sont identiques, mais une recherche passe d'environ 1,2 s à quelques ms, ce qui rend les écrans multi-recherches (simulateur, guide) instantanés.
