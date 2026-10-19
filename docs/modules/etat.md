# Module « État » — niveau 3 (DÉMO)

Vision : partie V du dossier « Fama AI » (Fama Macro, Fama Crisis, Fama Citizen Econ) et Fama Policy Simulator
(partie VII). Dans l'app **Co-founder**, ce niveau est livré **en démonstration** : chaque écran porte le bandeau
**« Démo — données fictives »**. Aucun indicateur réel n'est inventé ; aucune statistique du dossier investisseur
n'est reprise.

| Quoi | Statut |
|---|---|
| Séries macro, régions, secteurs, seuils de crise, profils, actualités, programmes d'aide | **Seed fictif** (`lib/modules/etat/seed.ts`), marqué « Exemple » / « fictif » |
| Couche réelle optionnelle | **Réelle** : API Indicateurs v2 de la Banque mondiale (publique, sans clé), source + date affichées |
| Références juridiques | **Corpus officiel** via l'ancrage existant (`legalBasis` / `groundQuery`) : fondé, partiel ou « non couvert » |
| Actions externes | Communiqué → Documents « à valider » ; email éventuel → **file d'approbation** (rien n'est envoyé seul) |

Accès : niveau **État (démo)** du workspace — 4 onglets réservés par la fondation (`macro`, `crise`, `citizen`, `policy`,
liens directs `/workspace#macro` etc.), offre payante (même paywall que l'assistant). Chaque onglet affiche le bandeau
démo et une barre de navigation entre les 4 écrans du niveau.

## 1. Tableau de bord macro
- Indicateurs (fictifs, 12 périodes M-11 → M) : indice des prix, inflation alimentaire, change FCFA/USD, balance
  commerciale, part de l'emploi informel, réserves (mois d'importations), stocks de céréales, prix des matières premières exportées.
- Granularité régionale (10 régions, valeurs fictives) : indice de tension affiché avec sa formule
  `50 × inflation alimentaire / 12 + 30 × part informelle + 20 × éloignement`, prix de marché simulés (maïs, riz, huile).
- Production sectorielle (6 secteurs, indices fictifs), alertes précoces par seuils.
- **Couche réelle** (case à cocher / `?reel=1` / outil `donnees_reelles: true`) : `lib/modules/etat/worldbank.ts`.
  - Indicateurs vérifiés le **2026-10-19** pour CMR : `FP.CPI.TOTL.ZG` (inflation), `PA.NUS.FCRF` (taux de change officiel),
    `NE.RSB.GNFS.ZS` (solde extérieur biens et services, % PIB), `SL.EMP.VULN.ZS` (emploi vulnérable, estimation OIT —
    **indicateur approché** de l'informalité, présenté comme tel). `SL.ISV.IFRM.ZS` (emploi informel) est **archivé** dans l'API : non utilisé.
  - Une requête groupée (`source=2`, WDI) puis repli indicateur par indicateur ; cache 6 h si tout a réussi.
  - Affiche : valeurs par année, date `lastupdated` de l'API, date/heure de récupération, lien JSON par indicateur, lien
    vers la documentation : <https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures>.
  - Échec réseau ou `ETAT_REAL_DATA=off` → statut « indisponible » / « désactivé », l'écran reste en démo.

## 2. Module crise
- 6 indicateurs précurseurs (réserves, dépréciation sur 3 périodes, inflation alimentaire, stocks, prix export sur 6 périodes,
  balance commerciale) avec **seuil de vigilance** et **seuil critique** d'exemple.
- Score d'indicateur linéaire : 0 = sain, 50 = vigilance, 100 = critique. Risque par type de crise (change,
  approvisionnement, matières premières) = somme pondérée (poids affichés). Niveaux : faible / vigilance / élevé / critique.
- **Fenêtre d'action** = périodes (× 30 jours) avant le seuil critique si la tendance des 3 dernières périodes se poursuit.
- Actions préventives (pistes à évaluer), **plan de communication citoyenne segmenté par profil** (agriculteur, famille,
  artisan, commerçant, transporteur) : stock raisonnable, adaptation de la consommation, aides (exemples), conseils,
  canaux, calendrier J0 → fin de crise, **guidance anti-panique**.
- « Préparer le communiqué » : document Markdown « à valider » (avec section « Fondement juridique ») ; si des
  destinataires sont saisis, email en **file d'approbation**.

## 3. Économie citoyenne
- Actualités **d'exemple** (inflation alimentaire, FCFA qui s'apprécie / se déprécie, carburant, crédit, programme public)
  → explication pédagogique + conseils pratiques par profil (règles explicites effet → conseil).
- Programmes d'aide : **tous fictifs** (« EXEMPLE — … »), à remplacer par les programmes officiels.
- Références juridiques : requête par profil au corpus officiel (ex. loi-cadre sur la protection du consommateur quand elle
  ressort) ; sinon « non couvert par le corpus officiel ».

## 4. Simulateur de politiques
Mesures : variation de TVA, subvention des prix, droits de douane, prix du carburant, transfert monétaire ciblé.
Modèle linéaire statique, **toutes les hypothèses affichées et modifiables** (curseurs) :
1. prix par catégorie (alimentation, énergie & transport, biens importés, services) via des taux de répercussion ;
2. activité et emploi par secteur (choc de coûts + demande, élasticités) ;
3. pouvoir d'achat par profil (panier fictif, revenu sectoriel, transfert) en % et en FCFA/mois d'un profil type ;
4. effet net par région (structure fictive : agriculture, importations, éloignement) ;
5. effet budgétaire sur assiettes fictives ;
6. **effets non intentionnels** détectés (profil/région les plus touchés, effet régressif, coût élevé, fuite de subvention, emploi).
Formules et limites sont renvoyées avec chaque résultat ; « Enregistrer dans Documents » crée une note à valider.

## Outils de l'agent (démo + LLM)
`lib/modules/etat/agent.ts` exporte `agentModule = { id: "etat", tools, intents }`, enregistré dans
`lib/agent/registry.ts` (2 lignes). Les outils d'ancrage utilisent `legalBasis()` ; l'email du communiqué passe par
`proposeExternalMessage()` (file d'approbation + feu vert juridique, `module: "etat"`).
| Outil | Rôle |
|---|---|
| `etat_tableau_macro` | Tableau macro (+ `donnees_reelles` Banque mondiale, `region`, `pays`) |
| `etat_alertes_crise` | Risques, fenêtres d'action, indicateurs précurseurs |
| `etat_plan_communication_crise` | Plan segmenté par profil + fondement juridique |
| `etat_preparer_communique` *(externe)* | Document à valider + email en file d'approbation si destinataires |
| `etat_conseils_citoyens` | Conseils par profil, programmes d'exemple, fondement juridique |
| `etat_simuler_politique` | Simulation (+ `hypotheses`, `enregistrer`) + fondement juridique |

Chaque résultat contient `bandeau: "Démo — données fictives"` et une consigne demandant au modèle de l'annoncer.
Mode démo sans clé : 4 intentions `etat_macro`, `etat_crise`, `etat_citoyen`, `etat_simulateur` (regex volontairement
étroites pour ne pas détourner les demandes entrepreneur) ; la recherche juridique préalable reste exécutée en premier.

## API
| Route | Méthode |
|---|---|
| `/api/etat/macro?reel=1&region=…&pays=…` | GET |
| `/api/etat/crise?type=…&profils=…` | GET |
| `/api/etat/crise/communique` `{ companyId, type, profil?, destinataires? }` | POST |
| `/api/etat/citoyen?profil=…&actualites=…` | GET |
| `/api/etat/simulateur` (catalogue) / `{ kind, value, target?, assumptions?, enregistrer?, companyId? }` | GET / POST |
Toutes passent par `handlePaid` (offre payante) ; les écritures vérifient l'accès à l'entreprise.

## Variables d'environnement
- `ETAT_REAL_DATA` = `worldbank` (défaut) | `off`
- `ETAT_WB_COUNTRY` = code ISO3 (défaut `CMR`)

## Fichiers
`lib/modules/etat/{seed,macro,worldbank,crisis,citizen,policy,legal,agent}.ts`, `app/api/etat/**`,
`components/modules/etat/{EtatViews.tsx,etat.css}`, `components/modules/{macro,crise,citizen,policy}/*Panel.tsx`,
`tests/etat.test.ts`. Fichiers partagés touchés (une ligne par entrée, en fin de liste) : `lib/agent/registry.ts` (2),
`components/workspace/module-slots.tsx` (4), `.env.example` (bloc « Module État »). Aucun `moduleState` : le module est
sans état (seed statique en lecture seule) ; ses écritures passent par Documents et la file d'approbation du cœur.

## Tests
`tests/etat.test.ts` (20 tests) : bandeau et seed marqués, KPI/alertes/régions, couche Banque mondiale (fetch simulé :
analyse, requête groupée, panne, désactivation), scores et fenêtres de crise, plan segmenté, conseils par profil,
simulateur (TVA, subvention, carburant, transfert, hypothèses bornées), outils (documents, approbation sans envoi),
intentions démo sans détourner les intentions existantes, agent démo de bout en bout.
