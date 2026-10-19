# Ancrage juridique du co-fondateur IA

Principe demandé par Freddy : le co-fondateur est **d'abord un assistant juridique**. Chaque conseil ou action
(business plan, démarches, contrats, fournisseurs, conformité) part du corpus officiel fourni par l'État et cite
ses sources (document, article, page). Si aucun texte ne couvre la question, l'assistant **le dit** au lieu d'inventer.

## Comment c'est garanti

| Niveau | Mécanisme | Fichier |
|---|---|---|
| Ordre des outils | Une recherche juridique est exécutée **automatiquement avant** que le modèle choisisse ses outils, en mode LLM (Groq/OpenAI/Gemini) comme en mode démo ; `rechercher_textes_juridiques` est aussi le premier outil déclaré, marqué « OUTIL PRIORITAIRE ». | `lib/agent/runner.ts` (`preGround`), `lib/agent/tools.ts` |
| Chaque action | Chaque outil d'action fait sa propre recherche ciblée (`legalBasis`) et renvoie un champ `fondement_juridique` (statut + sources [Sx]). | `lib/agent/tools.ts` |
| Documents générés | Business plan, roadmap, statuts, contrats, NDA, PV : une section **« Fondement juridique (corpus officiel) »** est ajoutée, avec les sources ou la mention « Non couvert par le corpus officiel ». | `lib/legal/grounding.ts` (`groundingMarkdown`) |
| Démarches | Présentées comme **étapes juridiques numérotées**, chacune avec son fondement ou « non couvert ». | outil `checklist_creation_entreprise`, onglet Démarches |
| Prompt système | Méthode imposée : base juridique d'abord, citations [Sx] avec document/article/page, étapes sourcées, « non couvert » explicite, réponse qui commence par « Base juridique : … ». | `systemPrompt()` |
| UI | Bandeau sous chaque réponse : **« Fondé sur le corpus officiel »** (vert), **« Partiellement couvert »** (orange) ou **« Non couvert par le corpus officiel »** (rouge), avec les sources et le détail par action. Même indicateur dans Recherche juridique et sur chaque étape des Démarches. | `components/workspace/AgentPanel.tsx` (`GroundingBar`), `components/workspace/Tabs.tsx` |

## Statut de couverture

`assessCoverage(question, extraits)` mesure la part des termes significatifs de la question (hors mots génériques
comme « entreprise », « loi », « comment »…) retrouvés dans **un même** extrait officiel :

- **fondé** : ≥ 80 % des termes et au moins 2 termes ;
- **partiel** : ≥ 34 % et au moins 2 termes (un seul mot commun ne suffit pas : « recette » de cuisine ≈ « recettes » fiscales) ;
- **non couvert** : en dessous, ou aucun extrait officiel.

Les textes d'**exemple** (`corpus/exemples`) ne comptent jamais comme couverture officielle et restent signalés
« texte d'exemple, non officiel ».

## Limites (à connaître)

- L'indicateur est **lexical** : il prouve que les mots de la question figurent dans un texte officiel, pas que ce
  texte règle juridiquement la question. Exemple : « statuts SARL capital associés » trouve la loi 2010-013 sur les
  communications électroniques (qui parle du capital des opérateurs), faute de droit OHADA des sociétés dans le corpus.
- Le corpus actuel est centré télécoms/TIC, cybersécurité, commerce électronique, consommation et concurrence :
  le droit des sociétés, la fiscalité et le droit social sont souvent « non couverts » tant que l'État ne les fournit pas.
- En mode LLM, le modèle reçoit la consigne et les extraits ; la conformité de sa rédaction n'est pas vérifiée
  mot à mot. Le bandeau, lui, est calculé côté serveur et ne dépend pas du modèle.

## Tests

`tests/grounding.test.ts` : couverture fondé/partiel/non couvert, libellés, section Markdown, recherche juridique
toujours en premier, « non couvert » dit explicitement, démarches en étapes sourcées.
`tests/llm-loop.test.ts` : en mode LLM, la recherche préalable précède les outils du modèle et le prompt impose l'ancrage.
