# Module « memoire » — mémoire organisationnelle, salle de réunion, Score Co-founder, bas débit

Vision : parties VI (« Mémoire organisationnelle », « Salle de réunion intelligente ») et VII (« Score de crédibilité
vérifiable et signé ») du dossier produit. Tout le module est dans l'offre payante (même garde que l'assistant),
**sauf la page publique de vérification** `/verifier/<id>`, ouverte à tous par nature.

## 1. Mémoire organisationnelle

- **Index** (`lib/modules/memoire/memory.ts`) : par entreprise, décisions, réunions (transcription + résumé),
  documents, emails, journal d'audit et conversations avec l'agent. Recherche lexicale BM25 simplifiée
  (même tokenisation que le corpus juridique) + synonymes métier (« structure juridique » ≈ « forme sociale »)
  et bonus aux décisions pour les questions « pourquoi / qu'avons-nous décidé ».
- **Questions-réponses** (`POST /api/memoire/ask`) : éléments numérotés `[M1]…` avec lien vers l'onglet source.
  - Sans clé IA : réponse **extractive** (uniquement ce qui est consigné).
  - Avec clé (Groq / OpenAI-compatible / Gemini) : synthèse contrainte aux éléments fournis, articles cités
    uniquement s'ils figurent dans l'instantané juridique ; repli extractif en cas d'échec.
- **Articles de loi au moment de la décision** : à l'enregistrement, chaque décision reçoit un **instantané
  juridique figé** (`LegalSnapshot`) : recherche dans le corpus (`groundQuery`), statut fondé / partiel / non couvert,
  documents, pages, articles, lien PDF (`/api/document`) et extrait tel qu'il était. Rien n'est écrit à la main :
  si le corpus ne couvre pas le point, la décision l'indique (« non couvert »).
- **Registre des décisions** : statut (proposée, adoptée, révisée, abandonnée, avec motif consigné),
  raisons, alternatives écartées, sources (réunion, document, email…), tâches de suivi. Journalisé.

## 2. Salle de réunion intelligente

- Saisie : **texte** collé, **dictée** en direct (réutilise `VoiceInputButton` / Web Speech API), **audio**
  enregistré dans le navigateur (MediaRecorder) ou importé → `POST /api/memoire/transcribe` :
  Groq Whisper (`GROQ_API_KEY`) puis OpenAI-compatible (`OPENAI_API_KEY`) ; sans clé, transcription
  **de démonstration clairement marquée** (le fichier n'est envoyé nulle part).
- Réunion **en direct** : ajout d'interventions horodatées, « Résumé en direct » (aperçu sans écriture),
  « Clôturer » → résumé, décisions ajoutées au registre (avec instantané juridique), **tâches créées et assignées**
  aux membres cités (« Awa doit… », « Je vais… » attribué à l'orateur), échéances (« d'ici vendredi »,
  « dans 7 jours », « 30/10/2026 »). Clôture idempotente.
- Analyse : IA si clé (JSON strict, même structure), sinon règles déterministes (`analyze.ts`).
- **« Ce que j'ai manqué »** : dans une réunion (arrivée à `mm:ss`, n° de ligne ou %) ou dans l'entreprise depuis une date.
- **PV** : enregistré dans Documents (type `pv`, « à faire approuver »), export `.md` et version HTML imprimable (PDF).

## 3. Score Co-founder (signé Ed25519)

- Calcul (`score.ts`, méthodologie v`2026.10-1`, affichée dans l'onglet et sur la page publique) :
  délais tenus 30 % (clôture lue dans le journal), engagements respectés 30 % (actions de réunion, approbations
  sous 7 jours), objectifs atteints 25 % (démarches), décisions documentées et sourcées 15 %.
  Critère sans données exclu, poids renormalisés. Aucune donnée externe ; ce n'est pas une notation de crédit.
- **Attestation** : contenu canonique (JSON à clés triées) signé en Ed25519, validité 90 jours, révocable.
  `id` non devinable (`att_` + 72 bits aléatoires).
- **Clé** : `COFOUNDER_SCORE_SIGNING_KEY` (PKCS#8 PEM ou base64). Sans clé : générée au premier usage dans
  `data/score-signing-key.dev.pem` (droits 600, ignorée par git) et les attestations sont marquées **démo**.
  Rotation : `COFOUNDER_SCORE_TRUSTED_KEY_IDS`. La clé privée n'est jamais exposée.
- **Vérification publique** : `/verifier/<id>` (QR code SVG généré côté serveur avec `qrcode`), JSON
  `GET /api/verifier/<id>`, clé publique `GET /api/verifier/cle`. La page revérifie signature, clé publiée,
  expiration et révocation, et explique comment vérifier hors ligne.

## 4. Mode bas débit et vocal

- Interrupteur « interface allégée » (onglet Bas débit) : `data-lite` sur `<html>` → aucune image/vidéo,
  animations, ombres et dégradés supprimés (persisté, appliqué par `LiteModeBoot` dans le layout workspace).
- Page autonome **`/workspace/memoire/bas-debit`** (~1 Ko de JS propre) : résumé vocal de la situation,
  question tapée ou **dictée**, réponse **abrégée** (`POST /api/memoire/lite` : même agent, mêmes outils, même
  ancrage juridique, sources compactes), **lecture vocale** (bouton ou automatique), **file hors ligne**
  (localStorage, envoi au retour du réseau). Le service worker de la PWA met la page et les fichiers
  `/_next/static` en cache pour l'ouvrir sans connexion.

## Outils de l'agent (démo + LLM)

| Outil | Action |
|---|---|
| `memoire_interroger` | Q/R sur la mémoire, éléments `[Mx]` + textes figés |
| `memoire_registre_decisions` | Liste / filtre le registre |
| `memoire_enregistrer_decision` | Ajoute une décision (recherche juridique + instantané) |
| `memoire_reunion_analyser` | Analyse une transcription, décisions + tâches assignées |
| `memoire_reunion_lister` | Réunions |
| `memoire_ce_que_jai_manque` | Résumé de ce qui a été manqué |
| `memoire_reunion_pv` | PV dans Documents + liens d'export |
| `memoire_score` | Score + détail + méthodologie |
| `memoire_score_attester` | Attestation signée + lien `/verifier/<id>` |
| `memoire_resume_vocal` | Situation en 3 phrases (bas débit / voix) |

Planificateur démo : intentions **exclusives** (`demo.ts`) — une transcription collée contenant « devis » ou une
adresse email ne déclenche ni demande de devis ni email. La recherche juridique préalable reste exécutée en premier.

## API

`GET /api/memoire?companyId` · `POST /api/memoire/ask` · `GET|POST /api/memoire/decisions` ·
`PATCH /api/memoire/decisions/<id>` · `GET|POST /api/memoire/meetings` · `PATCH|POST /api/memoire/meetings/<id>`
(`apercu`, `cloturer`, `manque`, `pv`) · `GET /api/memoire/meetings/<id>/pv?format=md|html` ·
`POST /api/memoire/transcribe` (multipart `audio`, 25 Mo max) · `POST /api/memoire/missed` ·
`GET|POST|DELETE /api/memoire/score` · `GET|POST /api/memoire/lite` · publics : `GET /api/verifier/<id>`, `GET /api/verifier/cle`, page `/verifier/<id>`.
Contrôle d'appartenance : toutes les routes vérifient l'entreprise (ou l'objet) comme `lib/workspace/access.ts`.

## Données

`moduleState(data, "memoire", …)` (conventions) → `data.modules.memoire` : `decisions`, `meetings`, `attestations`,
`seeded` (marqueurs). `WorkspaceData` n'est pas modifié. Chaque élément porte `companyId`.
Seed de démo (`seed.ts`, `ensureMemoireSeed`) injecté une fois pour « Kmer Logistik (démo) » (co_kmerlog) : réunion de
lancement, 3 décisions et historique d'exécution **fictifs**, tous `isExample` ; références juridiques recherchées dans
le corpus au moment du seed (d'où un seed asynchrone, et non dans la fonction `seed()` de moduleState).
« Réinitialiser la démo » (`resetModuleStates`) conserve les données des entreprises réelles, efface celles des
entreprises de démo (y compris leurs attestations publiées) puis ré-applique le seed.

La mémoire indexe aussi **les collections des autres modules** (`data.modules.<id>.<collection>`, éléments de la même
entreprise) : un choix de forme juridique du module structure, un dossier de financement… y sont retrouvés, avec un
lien vers l'onglet du module.

## Intégration (conventions.md)

- Code : `lib/modules/memoire/` ; agent : `lib/modules/memoire/agent.ts` (`agentModule`, outils préfixés `memoire_`).
- UI : `components/modules/memoire/` — `MemoirePanel` (onglet `memoire`), `ReunionsPanel` (`reunions`),
  `ScorePanel` (`score`), `BasDebitPanel` (`bas-debit`), exports par défaut recevant `TabProps`.
- Intentions démo : deux `DemoIntent`. `memoire_reunion` (transcription collée, « PV de la réunion ») est
  **exclusive** : une transcription contenant « devis », « email » ou « statuts » ne déclenche ni demande de devis,
  ni email, ni document du cœur. Les autres intentions (mémoire, registre, score, ce que j'ai manqué, résumé vocal)
  s'ajoutent à la réponse du cœur.

## Fichiers partagés modifiés (une ligne par entrée, en fin de liste)

- `lib/agent/registry.ts` : import + entrée `memoire` en fin de MODULES ; champ optionnel `exclusive?: boolean` dans
  `DemoIntent` (mécanisme générique, utilisable par les autres modules).
- `lib/agent/demo-planner.ts` : prise en compte de `exclusive` (3 lignes).
- `components/workspace/module-slots.tsx` : 4 lignes (`memoire`, `reunions`, `score`, `bas-debit`).
- `components/workspace/module-catalog.tsx` : 1 ligne en fin de NAV (`bas-debit`, niveau Pilotage).
- `app/workspace/layout.tsx` : `LiteModeBoot` (mode allégé global, attribut `data-lite`).
- `public/sw.js` : cache v2, page bas débit disponible hors ligne (network-first + mise en cache), `/_next/static/`
  en cache-first, correction du repli de navigation.
- `.env.example` (bloc « Module memoire » en fin de fichier), `.gitignore` (`data/*.pem`), `package.json` (`qrcode`, `@types/qrcode`).

## Tests

`tests/memoire.test.ts` : analyse de transcription, échéances, seed, Q/R « Pourquoi avons-nous choisi cette structure
juridique ? », LLM simulé, réunion en direct → tâches → PV, « ce que j'ai manqué », score, signature (clé dev, clé env,
falsification, mauvaise clé, révocation), bas débit, transcription Groq simulée, outils et intentions de l'agent
(registre, exclusivité), moduleState + réinitialisation de la démo, indexation des autres modules.
