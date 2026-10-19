# Feu vert juridique & alerte de changement de loi (innovations — équipe fondation)

## 1. Feu vert juridique sur les cartes d'approbation
Toute action externe passée par `proposeExternalMessage` (ou `draftEmail`, `requestQuotes`, `followUpQuote`) reçoit un **contrôle juridique informatif** :

- `lib/workspace/legal-check.ts` → `computeLegalCheck(query)` interroge le corpus officiel (`groundQuery`, 3 sources max).
- Statut 🟢 *fondé* / 🟠 *partiel* / ⚪ *non couvert par le corpus*, avec les documents, pages, articles et un lien « ouvrir » vers le PDF.
- Affiché par `LegalGreenLight` (`components/workspace/Tabs.tsx`) sur chaque carte de la file d'approbation.
- **Jamais bloquant** : la décision reste humaine. Le contrôle est lexical (voir `docs/ANCRAGE_JURIDIQUE.md`).

## 2. Alerte de changement de loi
Quand l'État dépose ou remplace un texte (ré-ingestion `npm run index-documents` / `npm run ingest`), Co-founder signale les documents générés qui s'appuyaient sur ce texte.

| Élément | Fichier |
| --- | --- |
| Empreinte sha256 par texte source (cache sur la date de modification) | `lib/legal/fingerprint.ts` |
| Sources + empreintes enregistrées à la génération (`legalQuery`, `legalSources`, `corpusHashes`) | `saveDocument` (`lib/workspace/service.ts`) |
| Détection, mise à jour du fondement, ignorer, simulation démo | `lib/modules/law-watch/service.ts` |
| Outils agent `loi_verifier_changements`, `loi_mettre_a_jour_document` + intention « changement de loi » | `lib/modules/law-watch/agent.ts` |
| API `GET/POST /api/legal-watch` (payant, contrôle d'appartenance) | `app/api/legal-watch/route.ts` |
| Carte « Alerte de changement de loi » | onglet **Veille réglementaire** |

Fonctionnement :

1. Les documents générés (business plan, roadmap, statuts, pacte, PV, contrats, documents du module *structure*) portent une section « Fondement juridique (corpus officiel) » et l'empreinte des textes cités.
2. `scanLawChanges` compare ces empreintes au corpus actuel : un texte modifié ou retiré passe le document en **« à revoir »** (journal `loi.changement`).
3. **Mettre à jour le fondement** : la section est régénérée sur le corpus actuel et le document repasse en « à relire ». Rien n'est modifié sans action humaine.
4. **Simuler un changement (démo)** : marque un texte comme modifié pour la démonstration. Aucun texte réel n'est touché, et l'alerte porte le badge « démo ».

Tests : `tests/law-watch.test.ts`. Ils couvrent une vraie modification d'un index temporaire, la mise à jour, la simulation et l'alerte ignorée.
