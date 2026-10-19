# Co-founder — Co-fondateur IA ancré dans le droit camerounais

> Co-founder est né du projet **Droit.cm**
> (dépôt d'origine [SKJUV/hackaton](https://github.com/SKJUV/hackaton), assistant juridique sur les textes
> officiels camerounais) et en garde le cœur : chaque conseil part du corpus officiel et le cite.
> La vision produit s'inspire du dossier « Fama AI » (trois niveaux : Entrepreneur, Entreprise, État) ;
> les chiffres de ce dossier ne sont pas repris comme des faits dans l'application.

Assistant pour les startupers camerounais qui **agit** au lieu de seulement répondre :
il rédige et envoie des emails (après validation), contacte les fournisseurs et suit les devis,
pilote les démarches de création, génère business plan, roadmap, statuts et contrats,
surveille la conformité et répond aux questions juridiques **en citant les textes officiels**
(document, page PDF, articles).

> Branche `feature/assistant-agentique`, construite sur `feature/redesign-ui-onboarding`
> (UI, PWA, voix) + les améliorations de citations de `main`.

## Démarrage rapide

Prérequis : Node.js ≥ 18.18, `poppler-utils` (`sudo apt install poppler-utils`).

```bash
npm install
cp .env.example .env.local      # facultatif : sans clé, tout fonctionne en mode démo
npm run index-documents         # indexe les 89 PDF officiels → data/documents.json (~1 min)
npm run dev
```

- Assistant juridique (chat, **gratuit, sans compte**) : http://localhost:3000
- **Co-fondateur IA / workspace** (abonnement) : http://localhost:3000/workspace
- Tarifs : http://localhost:3000/tarifs · Connexion : http://localhost:3000/connexion

Accès démo le plus rapide : sur `/workspace` ou `/connexion`, cliquez **« Freddy Choudja (démo · abonné) »**
(abonnement simulé déjà actif). « Awa Mbarga (démo · gratuit) » montre le paywall ; « Continuer en démo »
crée une session invité, qui peut activer l'abonnement en simulation depuis `/tarifs`.

Autres commandes : `npm test` (vitest), `npm run typecheck`, `npm run build`,
`npm run ingest-corpus` (textes officiels Markdown/JSON), `npm run index-documents -- --ocr` (OCR des scans).

## Fonctionnalités

| Module | Ce que ça fait |
|---|---|
| **Agent co-fondateur** (`/workspace` → Agent) | Function-calling sur 17 outils : recherche juridique sourcée, rédaction d'email, annuaire fournisseurs, demandes de devis, suivi et relances, tâches, business plan, roadmap, checklist et suivi des démarches, trames juridiques, score de conformité, calendrier, veille, briefing. Chaque appel d'outil est affiché dans la conversation. |
| **File d'approbation** | Toute action externe (email libre, demande de devis, relance) crée un brouillon + une demande de validation. Rien ne part sans clic « Valider et envoyer » d'un membre (propriétaire/admin/membre ; un lecteur ne peut pas valider). |
| **Boîte d'envoi** | Tous les emails avec statut : à valider, simulé, envoyé, rejeté, échec. |
| **Fournisseurs & devis** | Annuaire filtrable, demande multi-fournisseurs, suivi, relance, comparaison (meilleur prix mis en évidence), acceptation/refus. |
| **Démarches** | Checklist de création d'entreprise avec statut par étape (à faire / en cours / fait / bloqué). |
| **Documents** | Business plan, roadmap, statuts, contrat de prestation, NDA, contrat de travail, PV d'AG — générés depuis le profil entreprise, marqués « à valider ». |
| **Recherche juridique** | Recherche directe dans le corpus, extraits + lien vers la page du PDF officiel. |
| **Conformité & calendrier** | Score 0–100 (démarches 50 pts, obligations 30 pts, documents 20 pts) + recommandations ; obligations avec retard, rappels automatiques vers les tâches. |
| **Veille réglementaire** | Croise les mots-clés du secteur de l'entreprise avec le corpus officiel ; les nouveaux textes déposés par l'État remontent en priorité. |
| **Workspace multi-entreprise** | Plusieurs entreprises, membres et rôles, journal d'audit de toutes les actions (agent et humains). |

## Ancrage juridique (priorité du co-fondateur)

Le co-fondateur part **toujours** du corpus officiel : une recherche juridique est faite avant toute action
(mode LLM comme mode démo), chaque action (business plan, démarches, contrats, fournisseurs, conformité) porte son
propre fondement, les documents générés contiennent une section « Fondement juridique », et chaque réponse affiche
un bandeau **« Fondé sur le corpus officiel »**, **« Partiellement couvert »** ou **« Non couvert par le corpus officiel »**.
Si rien ne couvre la question, l'assistant le dit et n'invente pas. Détails : `docs/ANCRAGE_JURIDIQUE.md`.

## Connexion (jamais bloquante)

| Moyen | Détail |
|---|---|
| Code à 6 chiffres / lien magique | `/connexion` : saisir un email → code + lien valables 30 min. En `MAIL_MODE=simulation`, le code est **affiché directement** et visible dans `/connexion/boite-demo` (aucun email réel). |
| Continuer en démo | Session invité immédiate, sans email ni mot de passe. |
| Comptes démo | Un clic : « Freddy (démo · abonné) », « Awa (démo · gratuit) ». |
| Inscription | `/inscription` : accès immédiat, sans vérification bloquante ; mot de passe **facultatif**. |
| Mot de passe | Facultatif, défini/supprimé dans `/compte`. En cas d'oubli : `/mot-de-passe-oublie` envoie un code/lien qui connecte directement. |
| Déconnexion | `/deconnexion`. |

Sessions : cookie HttpOnly signé HMAC-SHA256 avec `AUTH_SECRET` (défaut de développement si absent —
à définir en production). Le chat juridique, la recherche et la lecture des textes ne demandent aucun compte.

## Abonnement

| Plan | Contenu | Prix |
|---|---|---|
| Gratuit | Chat juridique sourcé, recherche dans le corpus, lecture des articles et PDF, voix, PWA | 0 FCFA |
| Co-fondateur IA | Agent qui agit, workspace, emails, fournisseurs, documents, conformité, veille | **9 900 FCFA/mois — prix d'exemple à confirmer** |
| Équipe / Incubateur | Idem, orienté multi-entreprises | **29 900 FCFA/mois — prix d'exemple à confirmer** |

- Les prix se règlent par `PRICE_COFONDATEUR_XAF` / `PRICE_EQUIPE_XAF` ; tant qu'ils ne sont pas définis, la page affiche « Prix d'exemple ».
- Les limites « 1 entreprise / 3 membres » sont **indicatives** et **non appliquées** techniquement : les deux plans payants débloquent tout l'assistant.
- Paywall : `/workspace` affiche une page d'offre (CTA démo + plans) ; les API `/api/workspace/*` et `/api/agent` renvoient 401/402. `BILLING_PAYWALL=off` ouvre tout.
- Paiement : `PAYMENT_PROVIDER=simulation` (défaut, bouton « Activer (démo) ») ou `cinetpay` / `notchpay` (Mobile Money) / `stripe` (carte). Retour `/api/billing/return`, webhooks `/api/billing/webhook/{cinetpay|notchpay|stripe}` (signature vérifiée et statut re-vérifié auprès du prestataire). Si le prestataire choisi est incomplet, repli automatique en simulation. Les comptes démo/invités peuvent toujours activer en simulation.
- ⚠️ Les intégrations CinetPay, NotchPay et Stripe sont écrites d'après leur documentation publique mais **n'ont pas été testées** contre les API réelles (aucune clé) : à valider en sandbox. Campay n'est pas encore branché.

## Réel vs seedé (démo)

| Élément | Statut |
|---|---|
| Corpus juridique : 89 PDF de `reglementation/` et `publications/` (lois, décrets, arrêtés, décisions ART, directives CEMAC, recueils) | **Réel** — fourni dans le dépôt, considéré officiel |
| Textes déposés dans `corpus/officiel/` | **Réel** — couche d'ingestion prête, dossier vide pour l'instant |
| `corpus/exemples/` (création d'entreprise, fiscalité, contrats) | **Exemple non officiel** — toujours affiché « ⚠️ Texte d'exemple, non officiel » ; ne cite aucune vraie loi |
| Entreprises « (démo) », membres, note de cadrage | Seed fictif |
| Annuaire fournisseurs (14) | Seed fictif — adresses `@*.example.com` (domaine réservé, jamais livrable) |
| Étapes de création d'entreprise, calendrier fiscal/social | Seed **exemple** à remplacer par les procédures et échéances officielles |
| Réponses fournisseurs (« Simuler réponse ») | Simulées, marquées « simulée » |
| Envoi d'emails | `MAIL_MODE=simulation` par défaut : aucun envoi réseau. `live` + Resend/SMTP = envoi réel après validation |
| Agent | Réel avec une clé (Groq, Gemini ou compatible OpenAI). **Sans clé : planificateur à règles** qui appelle exactement les mêmes outils (badge « Mode démo ») |
| Chat juridique (`/`) | Réel avec une clé ; sans clé, restitue les extraits officiels sans reformulation |
| Codes de connexion / liens magiques | Réels (usage unique, 30 min) ; l'email est simulé en `MAIL_MODE=simulation` |
| Comptes « (démo) » et abonnement de Freddy (démo) | Seed |
| Paiement | Simulé par défaut ; prestataires réels activables par variables d'env (non testés) |

## Variables d'environnement

Voir `.env.example`. Résumé :

| Variable | Rôle |
|---|---|
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` (+ `*_MODEL`, `OPENAI_BASE_URL`) | Fournisseurs IA (function-calling). Aucune n'est obligatoire. |
| `LLM_PROVIDER` / `AGENT_PROVIDER` | `auto` (Groq → OpenAI → Gemini), `groq`, `gemini`, `openai`, `demo` |
| `MAIL_MODE` | `simulation` (défaut) ou `live` |
| `MAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY`, `SMTP_*` | Envoi réel en mode `live` |
| `WORKSPACE_DB_PATH` | Emplacement de la base JSON du workspace |
| `AUTH_SECRET`, `APP_URL` | Signature des sessions (obligatoire en prod) ; URL publique pour les liens magiques et retours de paiement |
| `BILLING_PAYWALL` | `on` (défaut) / `off` |
| `PRICE_COFONDATEUR_XAF`, `PRICE_EQUIPE_XAF` | Prix réels (sinon prix d'exemple affichés) |
| `PAYMENT_PROVIDER` + `CINETPAY_*`, `NOTCHPAY_*`, `STRIPE_*` | Paiement réel |

Les clés restent côté serveur ; elles ne sont jamais renvoyées au navigateur ni journalisées.

## Ajouter les textes officiels fournis par l'État

1. PDF → déposer dans `corpus/officiel/` puis `npm run index-documents`.
2. Markdown/texte/JSON → déposer dans `corpus/officiel/` (format décrit dans `corpus/officiel/README.md`) puis `npm run ingest-corpus`.
3. Les nouveaux textes sont immédiatement cherchables par l'agent, cités avec leur source et signalés « Nouveau texte officiel » dans la veille.

## Architecture

```
app/
  page.tsx                    chat juridique (existant) + lien Workspace
  workspace/                  UI du workspace (13 onglets)
  api/chat                    chat juridique sourcé (+ mode démo)
  api/agent                   agent co-fondateur (boucle function-calling)
  api/workspace/**            REST : entreprises, membres, approbations, tâches, devis,
                              documents, démarches, obligations, veille, recherche, reset
lib/
  agent/tools.ts              registre des 17 outils (schémas JSON + exécution)
  agent/runner.ts             boucle Groq/OpenAI (tools) et Gemini (functionDeclarations), repli démo
  agent/demo-planner.ts       planificateur à règles sans clé IA
  workspace/                  types, store JSON transactionnel, services, seed
  mail/                       simulation | Resend | SMTP
  legal/                      citations (articles, recueils), corpus unifié officiel + exemples
  cofounder/                  business plan, roadmap, trames juridiques
  compliance/                 score de conformité, veille
  auth/                       sessions signées, codes/liens magiques, invité, démo, mot de passe optionnel
  billing/                    plans, abonnements, prestataires (simulation, CinetPay, NotchPay, Stripe)
app/(compte)/                 connexion, inscription, mot de passe oublié, déconnexion, compte, tarifs
corpus/officiel | exemples    textes de l'État | seeds d'exemple
tests/                        vitest (46 tests)
```

La persistance est un fichier JSON (`data/workspace.db.json`, ignoré par git) derrière
`readData`/`withData` : remplaçable par Postgres/SQLite sans toucher aux routes.
Le bouton ↺ du workspace réinitialise les données de démonstration.

## Intégration d'ai-cofounder-studio

Le push de la branche `ai-cofounder` de https://github.com/Noah12345578/ai-cofounder-studio est en cours ;
un emplacement payant est prêt (onglet « Studio co-fondateur », `/api/studio`, `lib/studio/registry.ts`). Voir `docs/AI_COFOUNDER_STUDIO.md`.

## Limites connues

- Le sélecteur « Je suis » du workspace choisit le membre qui valide les actions (par défaut, celui dont l'email correspond au compte connecté).
- Contrôle d'appartenance (`lib/workspace/access.ts`) : chaque action (par entreprise ou par identifiant : approbation, devis, tâche, démarche, obligation, document) vérifie que l'utilisateur est membre de l'entreprise propriétaire, sinon 404. Une approbation sur une vraie entreprise ne peut être faite qu'en son propre nom. Les entreprises **de démonstration** restent partagées par tous (jeu de rôle libre) ; « Réinitialiser la démo » ne touche plus aux vraies entreprises ni aux comptes.
- L'indicateur « fondé / non couvert » est lexical (voir `docs/ANCRAGE_JURIDIQUE.md`).
- Stockage fichier : adapté à la démo et à un serveur unique, pas au serverless multi-instance.
- Corpus actuel centré postes/télécoms/TIC, cybersécurité, commerce électronique, consommation, concurrence :
  le droit des sociétés, la fiscalité et le droit social sont à fournir (en attendant, exemples marqués).
- La présence d'un texte ne garantit pas qu'il soit en vigueur ; l'outil ne remplace pas un professionnel du droit.
