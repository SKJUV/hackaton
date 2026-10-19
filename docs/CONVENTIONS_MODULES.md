# Conventions d'intégration — Co-founder (équipes modules)

Branche d'intégration : `feature/assistant-agentique` (fork `arispacco/hackaton`, PR SKJUV/hackaton#1).
Partez TOUJOURS du dernier `fork/feature/assistant-agentique` (`git fetch fork && git merge fork/feature/assistant-agentique` dans votre worktree `mod/<module>`), car la fondation y est poussée.

## 1. Où mettre le code (dossiers propres au module)

| Quoi | Où |
|---|---|
| Logique métier, seed, outils agent | `lib/modules/<module>/` (`service.ts`, `seed.ts`, `agent.ts`…) |
| Composant UI de l'onglet | `components/modules/<module>/<Module>Panel.tsx` (export **par défaut**, reçoit `TabProps`) |
| Routes API | `app/api/<module>/…/route.ts` |
| Pages publiques éventuelles | `app/<module>/…` (ex. `app/score/verifier/page.tsx`) |
| Doc | `docs/modules/<module>.md` (réel vs seedé, variables d'env) |
| Tests | `tests/<module>*.test.ts` (utiliser `useTempDb` de `tests/setup-db.ts`) |

IDs de modules réservés (onglets déjà créés) : `idea`, `structure` (fondation), `fund`, `team`, `mentor`, `market`, `data`, `finance`, `intel`, `risk`, `due-diligence`, `data-room`, `memoire`, `reunions`, `score`, `comms` (à attribuer), `macro`, `crise`, `citizen`, `policy`, `connecteurs`.

## 2. Fichiers partagés : UNE ligne par entrée, ajoutée en fin de liste

1. **Onglet UI** : `components/workspace/module-slots.tsx`
   ```ts
   fund: load(() => import("@/components/modules/fund/FundPanel")),
   ```
   L'entrée de navigation existe déjà dans `components/workspace/module-catalog.tsx` (niveaux Pilotage / Entrepreneur / Entreprise / État / Connecteurs). Pour un nouvel onglet, ajoutez une ligne en fin de `NAV` (`kind: "module"`).
   Lien direct : `/workspace#<module>`.
2. **Outils de l'agent** : `lib/agent/registry.ts` — DEUX lignes :
   ```ts
   import { agentModule as fund } from "@/lib/modules/fund/agent";   // sous « imports des modules »
   fund,                                                              // en fin de MODULES
   ```
   `lib/modules/<module>/agent.ts` exporte :
   ```ts
   export const agentModule: AgentModule = { id: "fund", tools: [...], intents: [...] };
   ```
   - Outils (`AgentTool`, voir `lib/agent/tools.ts`) : noms snake_case **préfixés par le module** (`fund_lister_programmes`), description FR précise, `parameters` JSON Schema `type: "object"`, `run(input, ctx)` → `{ summary, data }`. Le mode LLM (Groq/OpenAI/Gemini) les voit automatiquement.
   - Mode démo (sans clé IA) : `intents: [{ name, test: /regex sur texte normalisé sans accents/, run: async ({ company, message, call, ctx }) => "paragraphe Markdown" }]`. `call("outil", input)` exécute un outil et le trace.
   - `ctx.companyId` = entreprise de la conversation : vérifiez qu'un objet passé par id appartient bien à cette entreprise.
3. **Seed** : ne modifiez pas `lib/workspace/seed.ts`. Utilisez l'état de module (ci-dessous).

## 3. Données : `moduleState` (aucune modification de `WorkspaceData`)

```ts
import { moduleState, forCompany, readData, withData, newId, nowIso } from "@/lib/modules/http";
const seed = () => ({ applications: [ { id: "app_demo1", companyId: "co_kmerlog", isExample: true, ... } ] });
const st = moduleState(await readData(), "fund", seed);         // lecture
await withData((d) => { moduleState(d, "fund", seed).applications.push({...}); });  // écriture
```
- Chaque élément de collection porte `companyId` ; les éléments de démo ciblent `co_kmerlog` / `co_afritel` et `isExample: true`.
- Catalogues statiques en lecture seule (programmes, mentors, appels d'offres…) : un fichier TS dans `lib/modules/<module>/` suffit.
- « Réinitialiser la démo » conserve les éléments des vraies entreprises et ré-applique votre seed.

## 4. Routes API, gating et accès

```ts
import { handlePaid, readJson, s, assertCompanyAccess } from "@/lib/modules/http";
export async function POST(req: Request) {
  return handlePaid(async (viewer) => {
    const b = await readJson(req);
    await assertCompanyAccess(s(b.companyId), viewer);
    ...
  });
}
```
- Modules = offre payante → `handlePaid` (401/402 automatiques). Routes publiques : `handle`.
- Toujours `assertCompanyAccess` (ou `assertObjectAccess` pour les objets du cœur) AVANT d'agir.

## 5. Actions externes : file d'approbation + feu vert juridique

```ts
import { proposeExternalMessage } from "@/lib/modules/http";
await proposeExternalMessage(companyId, { module: "fund", type: "fund_relance", title, summary,
  channel: "email" /* ou "whatsapp" | "sms" (toujours simulés) */, to, subject, body, legalQuery? });
```
- Rien ne part sans validation humaine ; le feu vert juridique (articles cités) apparaît dans la carte d'approbation.
- Destinataires de démo : domaine `example.com` uniquement. Jamais de vrai contact pendant le dev.

## 6. Ancrage juridique (règle n°1)

- Tout conseil/action à dimension juridique appelle `legalBasis(ctx, requête)` (`lib/agent/tools.ts`) ou `groundQuery()` (`lib/legal/grounding.ts`) et renvoie `fondement_juridique` (statut `fonde` / `partiel` / `non_couvert` + sources document/page/article).
- « Non couvert par le corpus » plutôt qu'inventer. Documents générés : ajouter `groundingMarkdown(g)`.

## 7. Marquage démo / exemple

- Données fictives : `isExample: true` + libellé « (exemple) » / « (démo) » ; niveau État : bandeau « démo, données fictives ».
- Aucun chiffre du dossier investisseur présenté comme un fait ; aucun texte de loi inventé.
- Connecteurs réels : code réel branché derrière une variable d'env ; sans clé → bascule démo **marquée** (testée avec mocks `vi.stubGlobal("fetch", …)`).

## 8. Avant de pousser `mod/<module>`

`npx tsc --noEmit && npx vitest run && npx next build` dans le worktree, puis `git push fork mod/<module>`. Pas de force-push, pas de merge vers SKJUV. L'équipe intégration fusionne dans `feature/assistant-agentique`.

## Recouvrements d'intentions (mode démo) et sécurité des réponses
- Quand deux intentions de modules se recouvrent, ajoutez une ligne dans `INTENT_ARBITRATION` (`lib/agent/demo-planner.ts`) : `{ when, skip, why }`. Exemple : la data room l'emporte sur `fund_financements`. `DemoIntent.exclusive` (module mémoire) reste disponible.
- Les champs optionnels des outils acceptent `null` automatiquement (`nullableOptionals`), et les `null` sont retirés avant exécution (`stripNulls`). N'en dépendez pas pour les champs requis.
- Toute réponse LLM passe par `checkReferences` (`lib/legal/reference-check.ts`) : un numéro de texte absent du corpus et des extraits cités est retiré ou signalé.
