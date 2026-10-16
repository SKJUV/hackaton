# Intégration de Noah12345578/ai-cofounder-studio

Demande : analyser toutes les branches de https://github.com/Noah12345578/ai-cofounder-studio et intégrer
dans l'assistant payant ce qui est utile et non redondant, en respectant la licence et en citant la provenance.

## Constat (16/10/2026, vérifié plusieurs fois entre 12h13 et la publication de la PR, heure de Douala)

- `gh api repos/Noah12345578/ai-cofounder-studio` : `size: 0`, créé le 16/10/2026 à 12h09, dernier push 12h09.
- `gh api .../branches` : `[]` — **aucune branche**.
- `git ls-remote` : aucune référence ; `git clone` : « You appear to have cloned an empty repository ».
- `gh api .../contents` : 404 « This repository is empty ». Aucune licence.
- Fork sous `arispacco` : refusé par GitHub — « HTTP 403: The repository exists, but it contains no Git content. Empty repositories cannot be forked. »

**Rien n'a donc été repris** (aucun code, prompt ni UI). Aucune fonctionnalité de ce dépôt n'a été écartée.

## Pour intégrer dès que le code est poussé

1. Noah pousse ses branches (et idéalement un fichier LICENSE).
2. Forker sous `arispacco`, lister les branches (`git ls-remote`), comparer (commits, fichiers, fonctionnalités).
3. Points d'accroche prévus dans ce projet :
   - nouveaux outils d'agent → `lib/agent/tools.ts` (registre unique, exposé à Groq/Gemini/OpenAI et au mode démo) ;
   - prompts → `lib/agent/runner.ts` (`systemPrompt`) ;
   - générateurs (pitch, études, plans) → `lib/cofounder/generators.ts` ;
   - écrans → nouvel onglet dans `app/workspace/page.tsx` (déjà derrière le paywall).
4. Citer la provenance (dépôt, branche, commit) dans les messages de commit et dans ce document.
