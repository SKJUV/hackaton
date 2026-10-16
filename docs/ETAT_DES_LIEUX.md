# État des lieux — dépôt SKJUV/hackaton (16/10/2026)

## 1. Branches et historique
| Branche | HEAD | Auteur | Commits | Contenu |
|---|---|---|---|---|
| `main` | 566a87d | Diallo Souleyman | 10 (03:20 → 09:40, 16/10) | Chatbot juridique RAG « Droit.cm » (Next.js), 50 questions métier, citations d'articles améliorées |
| `feature/redesign-ui-onboarding` | 3ba9d38 | skjuv | main@60a93a2 + 6 commits (09:54 → 11:36) | Tout `main` jusqu'à 60a93a2 + refonte UI, dark mode, onboarding, PWA hors-ligne, chat vocal, tiroir « article » (API `/api/article`), doc base de données eGova, CLI Python |

- Merge-base : `60a93a2`. `main` a **2 commits** absents de la feature (`aa97327`, `566a87d` : extraction des numéros d'article, détection des recueils et titre de loi dans les citations — ~60 lignes dans `app/api/chat/route.ts` + CSS/page). La feature a **6 commits** absents de main (+3 971 / −1 369 lignes, 23 fichiers).
- **Aucune branche, commit, PR (ouverte ou fermée) ni fork « refactor AI »** : `gh pr list --state all` vide, 0 fork, aucun message de commit contenant refactor/ai/agent. Le travail « refactor AI » n'existe pas sur GitHub (peut-être local chez un contributeur non poussé → question pour Freddy).

## 2. Stack
- Next.js 15 (App Router) + React 19 + TypeScript strict, `lucide-react`, CSS global (pas de Tailwind).
- Indexation : `scripts/index-documents.mjs` (pdftotext/pdftoppm + Tesseract.js OCR optionnel) → `data/documents.json` (ignoré par git).
- Recherche : `lib/documents.ts` — BM25-like lexical + règles métier (télécom, postal, cyber, conso…). Pas d'embeddings.
- IA : appels HTTP directs Groq (OpenAI-compatible, `openai/gpt-oss-120b`) et/ou Gemini (`gemini-3.5-flash` + fallbacks), **sans function-calling** : un seul tour question → réponse avec marqueurs [S1]…
- Corpus réel dans le dépôt : **89 PDF officiels** (~547 Mo) — `reglementation/` (Lois, Décrets, Arrêtés, Décisions ART, Directives CEMAC, Recueils) et `publications/` (rapports, appels d'offres, actualités ART). Domaine : postes, télécoms, TIC, cybersécurité, commerce électronique, consommation, concurrence.
- Pas de base de données, pas d'auth, pas de tests, pas de CI.

## 3. Variables d'environnement
`GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `LLM_PROVIDER` (auto|groq|gemini). Sans clé → l'API chat renvoie 503.

## 4. Lancement
`npm install && npm run index-documents && npm run dev` (poppler-utils requis).

## 5. Ce qui marche / ce qui manque
- ✅ Chat juridique sourcé (page PDF + lien vers le PDF via `/api/document`, sécurisé contre path traversal).
- ✅ UI premium (feature) : onboarding, PWA, voix (Web Speech API), dark mode.
- ⚠️ `/api/article` (feature) lit `data/base_de_donnees_reglementation.json` et `data/reglementation_articles_index.json` **qui ne sont pas versionnés** (gitignore) → tiroir article en erreur 500 sur un clone neuf. Le script Python a les mêmes dépendances.
- ❌ Aucun agent : pas d'outils, pas d'actions, pas d'email, pas de fournisseurs, pas de workspace, pas de persistance.
- ❌ Corpus sans droit général des sociétés/fiscalité (création d'entreprise, OHADA, impôts) → à fournir par l'État ou à seeder (marqué exemple).

## 6. Choix de la base
**`feature/redesign-ui-onboarding` (3ba9d38)** : elle contient tout `main` jusqu'à 60a93a2, est la plus récente et la plus riche (6 commits, 23 fichiers, UI/PWA/voix/tiroir article). Les 2 commits propres à `main` (citations d'articles) sont **reportés manuellement** dans la nouvelle branche (commit dédié, pas de merge).
