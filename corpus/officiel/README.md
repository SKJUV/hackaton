# Corpus officiel (fourni par l'État)

Déposez ici les textes juridiques **officiels** fournis par l'État. Ils sont considérés comme faisant foi.

Formats acceptés :
- **PDF** → indexés par `npm run index-documents` (comme `reglementation/` et `publications/`).
- **Markdown / texte** (`.md`, `.txt`) avec un en-tête optionnel :
  ```
  ---
  titre: Loi n° XXXX/YYY du ... relative à ...
  categorie: Lois
  source_officielle: Journal officiel n° ...
  date: 2024-01-15
  ---
  Article 1 — ...
  ```
- **JSON** : tableau `[{ "titre", "categorie", "source_officielle", "articles": [{ "numero", "texte" }] }]`.

Puis lancez `npm run ingest-corpus` (texte/JSON → `data/corpus-officiel.json`).
Ce fichier README n'est pas ingéré.
