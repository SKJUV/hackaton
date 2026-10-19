# Niveau Entrepreneur — Idée, Financements, Équipe & recrutement, Mentors, Marché B2B

Équipe « entrepreneur » de **Co-founder**. Cinq onglets du niveau Entrepreneur (`/workspace#idea`, `#fund`, `#team`, `#mentor`, `#market`), offre payante (`handlePaid`), données dans `data.modules.entrepreneur` (`moduleState`).

| Élément | Emplacement |
|---|---|
| Logique, seed, outils agent | `lib/modules/entrepreneur/` (`agent.ts` exporte `ideaModule`, `fundModule`, `teamModule`, `mentorModule`, `marketModule`) |
| UI | `components/modules/{idea,fund,team,mentor,market}/*Panel.tsx` (onglets) + `components/modules/entrepreneur/` (panneaux partagés) |
| API | `GET /api/entrepreneur?companyId=` (état), `POST /api/entrepreneur/<outil>` (toute action, même code que l'agent), `POST /api/entrepreneur/cv` (CV PDF, multipart) |
| Tests | `tests/entrepreneur.test.ts`, `tests/entrepreneur-team.test.ts` |

Lignes ajoutées aux fichiers partagés : 10 dans `lib/agent/registry.ts` (5 imports + 5 entrées), 5 dans `components/workspace/module-slots.tsx`.

## Ancrage juridique

Chaque outil à dimension juridique appelle `groundQuery()` (citations renumérotées [S1]… dans le contexte de l'agent) et renvoie `fondement_juridique` (`fonde` / `partiel` / `non_couvert`). Les tableaux « article par article » ne montrent que des extraits **officiels** du corpus (document, page, article, lien PDF). Le droit du travail n'est **pas** dans le corpus actuel : les fiches de poste et la conformité du recrutement affichent « Droit du travail : non couvert par le corpus officiel ». Un passage n'est cité comme droit du travail que s'il mentionne explicitement l'employeur ou le contrat de travail (sinon, les extraits hors sujet que la recherche peut renvoyer sont écartés).

## 1. Idée — diagnostic honnête (`idea_analyser`)

- Aucune validation automatique : score de 5 à 85 maximum, verdict parmi « fragile en l'état », « à consolider », « prometteuse sous conditions » (indicateur de maturité, jamais une validation).
- Obstacles réglementaires par thème (activité postale, télécoms, paiement, e-commerce, données personnelles, consommateur, concurrence), cités article par article ou « non couvert ».
- Indicateurs de marché = extraits de publications officielles du corpus (aucun chiffre inventé).
- Concurrents : recherche web réelle (Brave Search) si `BRAVE_SEARCH_API_KEY` est défini, sinon catégories génériques **marquées démo** (aucun concurrent nommé n'est inventé). Les concurrents connus saisis par l'utilisateur sont repris.
- Forces, faiblesses, conditions de succès et pivots. Historique (10 derniers) et export dans Documents.

## 2. Financements

| Outil | Rôle |
|---|---|
| `fund_profil_projet` | Profil d'éligibilité (âge, prototype, immatriculation, revenus, montant levé, ancienneté…) |
| `fund_lister_programmes` / `fund_evaluer_eligibilite` | Base de programmes + éligibilité critère par critère (ok / ko / à vérifier, et pourquoi) |
| `fund_preparer_dossier` | Dossier de candidature (Markdown, Documents, « à relire ») : pièces, réponses pré-remplies, fondement juridique |
| `fund_suivre_candidatures` / `fund_mettre_a_jour_candidature` | Suivi des candidatures. Le statut « soumise » crée une tâche de relance à J+21. |
| `fund_relancer_programme` (externe) | Relance par email via `proposeExternalMessage` → file d'approbation + feu vert juridique |

**Programmes réels, vérifiés par recherche web le 2026-10-19** (source dans `lib/modules/entrepreneur/programs.ts`, affichée dans l'UI) : Tony Elumelu Foundation, Orange POESAM, Africa's Business Heroes, Google for Startups Accelerator Africa, Google for Startups Cloud Program (Start), Microsoft for Startups, AWS Activate (Founders), FNE Cameroun, APME Cameroun, Y Combinator, MEST Africa Challenge. Les critères issus de sources secondaires sont marqués et ne rendent jamais un projet « non éligible » : ils passent en « à vérifier ». Les fenêtres de candidature fermées sont signalées.
**Programmes d'exemple** : 4 programmes fictifs, libellés « (exemple) », contacts `example.com`.

## 3. Équipe & recrutement

`team_definir_competences_membre`, `team_analyser_competences` (compétences manquantes selon le secteur → profils cofondateur / premier employé / prestataire), `team_rediger_fiche_de_poste` (fiche dans Documents, sans salaire inventé), `team_importer_candidature` (texte, ou PDF via `/api/entrepreneur/cv` avec `pdftotext`, 5 Mo max), `team_filtrer_candidatures` (score objectif sur critères pondérés et années d'expérience, **CV anonymisé** : nom, email et téléphone retirés avant le calcul ; seuil réglable ; un critère obligatoire manquant place le candidat sous le seuil), `team_noter_candidat` (analyse collaborative : moyenne et divergence), `team_decider_candidat` (forcer un candidat sous le seuil exige une justification, qui est tracée), `team_alertes_biais` (proche avancé sous le seuil, meilleur candidat sans lien non examiné, conflit d'intérêts du recommandeur, notes gonflées, part du réseau > 50 %), `team_conformite_recrutement`.
Dans une vraie entreprise, un membre ne peut noter qu'en son propre nom (contrôle par l'email de la session).

## 4. Mentors

`mentor_rechercher` (matching secteur et compétences, par défaut sur les compétences manquantes de l'équipe), `mentor_demander_mise_en_relation` (externe : email en approbation, une seule demande en attente par mentor). Les 8 profils sont des **exemples** (`@mentors.example.com`) : aucun partenariat réel.

## 5. Marché B2B

`market_rechercher_partenaires` : annuaire fournisseurs existant, compatibilité avec le besoin (couverture du besoin, ville, note) et solidité. La couverture du besoin est triée en premier, puis le score global (0,6 × compatibilité + 0,4 × solidité). Les indicateurs de solidité sont des **données d'exemple** (`market-seed.ts`), toujours affichées comme telles.
`market_demander_devis` (externe) : réutilise le flux de devis existant (approbation avant envoi).

## Actions externes et destinataires

Rien ne part sans validation humaine. Pendant le développement, **aucun vrai contact** n'est utilisé : une adresse hors `example.com` (par exemple le contact officiel d'un programme) est remplacée par `programme-<id>@demo.example.com`. L'adresse officielle reste indiquée dans le résumé de l'approbation. Pour viser les vrais contacts en production : `COFOUNDER_ALLOW_REAL_RECIPIENTS=true` (et `MAIL_MODE` réel), après décision du produit.

## Réel vs seedé

| Réel | Seedé (marqué exemple/démo) |
|---|---|
| Ancrage corpus, éligibilité, scoring, alertes de biais, dossiers, relances (approbation), extraction PDF, 11 programmes vérifiés (source + date) | 4 programmes fictifs, 8 mentors, solidité des fournisseurs, offre CTO et 4 CV de démo (Kmer Logistik), compétences des membres de démo |
| Recherche web Brave (si clé) | Concurrents génériques sans clé |

## Variables d'environnement

| Variable | Effet | Sans valeur |
|---|---|---|
| `BRAVE_SEARCH_API_KEY` | Recherche réelle des concurrents (Brave Search API) | Catégories génériques marquées démo |
| `COFOUNDER_ALLOW_REAL_RECIPIENTS` | `true` : autorise les vrais destinataires (contacts officiels des programmes) | Adresses `demo.example.com` |
| `MAIL_MODE` (commun) | Mode d'envoi après approbation | `simulation` |

`pdftotext` (poppler-utils) est nécessaire pour importer un CV en PDF : sans lui, l'API répond 501 et l'import par texte reste disponible.

## Limites connues

- Le droit du travail camerounais n'est pas dans le corpus : il faut l'ajouter pour citer période d'essai, contrat, etc.
- Les données des programmes évoluent : elles ont été vérifiées le 2026-10-19 et doivent être revérifiées avant chaque session de candidature.
- Les notes saisies via l'agent sont marquées « (via l'agent) ». Le contrôle « en son nom » ne s'applique qu'aux actions faites depuis l'UI.
