# Droit.cm — Co-fondateur IA & assistant juridique

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

- Assistant juridique (chat) : http://localhost:3000
- **Workspace entreprise / agent** : http://localhost:3000/workspace

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

## Variables d'environnement

Voir `.env.example`. Résumé :

| Variable | Rôle |
|---|---|
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` (+ `*_MODEL`, `OPENAI_BASE_URL`) | Fournisseurs IA (function-calling). Aucune n'est obligatoire. |
| `LLM_PROVIDER` / `AGENT_PROVIDER` | `auto` (Groq → OpenAI → Gemini), `groq`, `gemini`, `openai`, `demo` |
| `MAIL_MODE` | `simulation` (défaut) ou `live` |
| `MAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY`, `SMTP_*` | Envoi réel en mode `live` |
| `WORKSPACE_DB_PATH` | Emplacement de la base JSON du workspace |

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
corpus/officiel | exemples    textes de l'État | seeds d'exemple
tests/                        vitest (22 tests)
```

La persistance est un fichier JSON (`data/workspace.db.json`, ignoré par git) derrière
`readData`/`withData` : remplaçable par Postgres/SQLite sans toucher aux routes.
Le bouton ↺ du workspace réinitialise les données de démonstration.

## Limites connues

- Pas d'authentification : le sélecteur « Je suis » simule l'utilisateur courant.
- Stockage fichier : adapté à la démo et à un serveur unique, pas au serverless multi-instance.
- Corpus actuel centré postes/télécoms/TIC, cybersécurité, commerce électronique, consommation, concurrence :
  le droit des sociétés, la fiscalité et le droit social sont à fournir (en attendant, exemples marqués).
- La présence d'un texte ne garantit pas qu'il soit en vigueur ; l'outil ne remplace pas un professionnel du droit.
