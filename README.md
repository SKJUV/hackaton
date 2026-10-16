# Droit.cm

Assistant web d'information juridique basé sur les documents fournis pour le Cameroun. Les réponses Gemini ou Groq sont générées à partir des passages retrouvés dans `reglementation/` et `publications/`, avec des références vers les PDF et leurs pages.

## Prérequis

- Node.js 18.18 ou supérieur
- `pdftotext` et `pdftoppm` (Ubuntu/Debian : `sudo apt install poppler-utils`)
- Une clé Gemini configurée côté serveur

## Installation et lancement

```bash
npm install
cp .env.example .env.local
```

Dans `.env.local`, ajoute une clé **nouvellement créée** dans Google AI Studio :

```dotenv
GEMINI_API_KEY=your_private_key
GEMINI_MODEL=gemini-3.6-flash
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
LLM_PROVIDER=auto
```

Groq est une API distincte : crée une clé gratuite sur [console.groq.com](https://console.groq.com/) si tu veux l'utiliser. Quand les deux clés sont configurées, `LLM_PROVIDER=auto` essaie Groq puis Gemini, avec un modèle Gemini de secours en cas de surcharge. Tu peux choisir `groq` ou `gemini` avec `LLM_PROVIDER`. N'ajoute jamais une clé API au code client, au dépôt Git ou à une conversation publique. Redémarre le serveur après avoir modifié `.env.local`.

Prépare ensuite l'index documentaire et démarre l'application :

```bash
npm run index-documents
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000).

## Extraction et OCR

`npm run index-documents` parcourt les PDF des deux dossiers, extrait le texte et crée `data/documents.json` (ce fichier généré est ignoré par Git). Les fichiers identiques sont dédupliqués, en privilégiant les documents de `reglementation/` lors de la recherche.

Pour appliquer l'OCR aux pages qui ne contiennent presque aucun texte extractible :

```bash
npm run index-documents -- --ocr
```

Cette option utilise Tesseract.js avec les modèles français et anglais fournis par les dépendances du projet ; aucune installation système de Tesseract n'est nécessaire. Les modèles sont lus localement depuis `node_modules/`. Vérifie les résultats OCR avant de considérer le texte reconnu comme exact. Sans OCR, les pages image uniquement ne seront pas recherchables.

## Limites

Le corpus actuel est principalement consacré aux postes, aux télécommunications et aux TIC. Il contient aussi des communiqués, rapports, appels d'offres et publications : ils sont référencés selon leur document, sans être présentés automatiquement comme des lois. La présence d'un texte ne garantit pas qu'il soit toujours en vigueur ; l'application le signale et ne remplace pas l'avis d'un professionnel du droit.
# hackaton
