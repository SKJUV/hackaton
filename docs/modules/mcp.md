# Module « Connecteurs MCP » et « Communications » (équipe mcp-connecteurs)

Onglets : **Connecteurs MCP** (`/workspace#connecteurs`) et **Communications** (`/workspace#comms`, boîte unifiée).
Code : `lib/modules/mcp/`, `components/modules/mcp/`, routes `app/api/mcp/…`, tests `tests/mcp*.test.ts`.
Données : `moduleState(data, "connecteurs")` (collections `connections`, `calls`, `oauthPending`, `inbox`, `serverTokens`, `actions`, chacune avec `companyId`).

## 1. Ce qui est réel, ce qui est démo

| Élément | Réel | Démo (sans configuration) |
|---|---|---|
| Client MCP (SDK officiel `@modelcontextprotocol/sdk`) | Streamable HTTP, repli SSE, stdio en dev (`MCP_ALLOW_STDIO=true`) ; découverte dynamique des outils, appels réels | — (un serveur MCP n'a pas de mode démo : il est réel ou en erreur) |
| Authentification MCP | jeton Bearer, ou OAuth 2.1 standard MCP : découverte RFC 9728 / RFC 8414, enregistrement dynamique (DCR, RFC 7591) quand le serveur le permet, sinon client pré-enregistré (variables d'env), PKCE S256 | — |
| Connecteurs natifs (Gmail, Google Agenda, Outlook, WhatsApp Business, Slack, Notion, HubSpot) | API officielles + OAuth dès que les variables d'env sont fournies (ou jeton collé dans l'UI) | Connexion marquée **DÉMO** : outils identiques, données fictives, aucun appel réseau |
| Boîte unifiée (emails + WhatsApp) | Synchronisation Gmail/Outlook réels, webhook WhatsApp signé | Messages d'**exemple** (entreprises de démo uniquement, adresses `example.com`) |
| Serveur MCP de Co-founder | Réel (`POST /api/mcp/server`, jeton par entreprise) | — |
| Envois à des tiers | `CONNECTORS_SEND_MODE=live` après validation humaine | Par défaut **simulation** (suit `MAIL_MODE`) : rien ne part, statut « simulé » au journal |

Règles communes :
- **Lecture** : exécutée immédiatement, journalisée (arguments sensibles masqués).
- **Écriture** (tout outil MCP sans `readOnlyHint: true`, tout outil natif d'écriture) : placée dans la file **Approbations** (type `connecteurs_action`, module `connecteurs`) avec le **feu vert juridique**. Exécutée seulement à la validation.
- Secrets (jetons, refresh tokens, enregistrements de client) chiffrés AES-256-GCM (`CONNECTORS_ENCRYPTION_KEY`), jamais renvoyés au navigateur (l'UI ne voit que `hasBearer` / `hasOAuthTokens`).
- Garde SSRF : URL MCP en `https` uniquement (sauf `localhost` en dev), réseaux privés refusés sauf `MCP_ALLOW_PRIVATE_NETWORK=true`.
- Activation par entreprise (interrupteur par connecteur et par outil), journal des appels, test de connexion.
- Les résultats des connecteurs sont des **données** pour l'agent, jamais des instructions.

## 2. Catalogue

### Serveurs MCP distants officiels (URL vérifiées sur la doc des éditeurs le 19/10/2026)

| Service | URL | Authentification | À créer par Freddy |
|---|---|---|---|
| Notion | `https://mcp.notion.com/mcp` (SSE : `/sse`) | OAuth (DCR) ou jeton MCP Notion | Rien (DCR) |
| GitHub | `https://api.githubcopilot.com/mcp/` | PAT, ou OAuth avec app propre | PAT, ou OAuth App → `GITHUB_MCP_CLIENT_ID/SECRET` |
| Stripe | `https://mcp.stripe.com` | OAuth ou clé API restreinte | Rien (OAuth) ou clé restreinte |
| Linear | `https://mcp.linear.app/mcp` | OAuth 2.1 (DCR) ou clé API | Rien |
| HubSpot | `https://mcp.hubspot.com` | OAuth avec « MCP connector » pré-enregistré, PKCE | MCP connector → `HUBSPOT_MCP_CLIENT_ID/SECRET` |
| Slack | `https://mcp.slack.com/mcp` | OAuth confidentiel (pas de DCR) | App Slack (interne ou Marketplace) → `SLACK_CLIENT_ID/SECRET` |
| Sentry | `https://mcp.sentry.dev/mcp` | OAuth | Rien |
| Atlassian (Jira/Confluence) | `https://mcp.atlassian.com/v2/mcp` | OAuth 2.1 ou jeton API | Rien |
| Asana | `https://mcp.asana.com/v2/mcp` | OAuth (peut exiger un client) | Selon Asana → `ASANA_MCP_CLIENT_ID/SECRET` |

Tout autre serveur MCP s'ajoute avec **« Serveur MCP personnalisé »** (URL + jeton, ou OAuth automatique).

### Connecteurs natifs (API officielles)

| Connecteur | Outils (✎ = écriture, ✉ = envoi à un tiers, tous soumis à approbation) |
|---|---|
| Gmail | `gmail_lister_messages`, `gmail_lire_message`, ✎ `gmail_creer_brouillon`, ✉ `gmail_envoyer` |
| Google Agenda | `gcal_lister_evenements`, ✎ `gcal_creer_evenement` |
| Outlook / Microsoft 365 | `outlook_lister_messages`, `outlook_lire_message`, ✎ `outlook_creer_brouillon`, ✉ `outlook_envoyer`, ✉ `outlook_repondre`, `outlook_lister_evenements`, ✎ `outlook_creer_evenement` |
| WhatsApp Business (Cloud API) | `whatsapp_infos_numero`, ✉ `whatsapp_envoyer_texte`, ✉ `whatsapp_envoyer_modele` |
| Slack | `slack_lister_canaux`, `slack_lire_canal`, ✉ `slack_publier_message` |
| Notion | `notion_rechercher`, `notion_lire_page`, ✎ `notion_creer_page` |
| HubSpot | `hubspot_rechercher_contacts`, `hubspot_lister_transactions`, ✎ `hubspot_creer_contact`, ✎ `hubspot_ajouter_note` |

## 3. URI de redirection (une seule pour tous les fournisseurs)

```
{APP_URL}/api/mcp/oauth/callback
```
En local : `http://localhost:3000/api/mcp/oauth/callback`. En production : `https://<votre-domaine>/api/mcp/oauth/callback`.
Définir `APP_URL` en production (sinon l'URL est déduite de la requête).

## 4. Créer les applications OAuth (procédures exactes)

### 4.1 Google (Gmail + Google Agenda) — Google Cloud Console
1. https://console.cloud.google.com/ → créer un projet « Co-founder ».
2. **API et services → Bibliothèque** : activer **Gmail API** et **Google Calendar API**.
3. **Écran de consentement OAuth** (Google Auth Platform → Branding / Audience) : type **Externe**, nom de l'app, e-mail d'assistance, domaine autorisé ; ajouter les **utilisateurs test** (tant que l'app n'est pas validée).
4. **Accès aux données (scopes)** : `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly`, `…/gmail.compose`, `…/gmail.send`, `https://www.googleapis.com/auth/calendar.events`.
   Les scopes Gmail sont « restreints » : pour sortir du mode test, Google exige une validation (et un audit de sécurité pour les scopes restreints).
5. **Identifiants → Créer → ID client OAuth → Application Web** ; URI de redirection autorisée : `{APP_URL}/api/mcp/oauth/callback`.
6. Copier l'ID et le secret → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

### 4.2 Microsoft Outlook / Graph — Microsoft Entra ID
1. https://entra.microsoft.com → **Identité → Applications → Inscriptions d'applications → Nouvelle inscription**.
2. Types de comptes : « Comptes dans un annuaire organisationnel et comptes Microsoft personnels » (→ `MICROSOFT_TENANT_ID=common`) ou locataire unique (→ id du locataire).
3. URI de redirection : plateforme **Web**, `{APP_URL}/api/mcp/oauth/callback`.
4. **Certificats & secrets → Nouveau secret client** → `MICROSOFT_CLIENT_SECRET` ; **Vue d'ensemble → ID d'application (client)** → `MICROSOFT_CLIENT_ID`.
5. **Autorisations d'API → Microsoft Graph → Autorisations déléguées** : `offline_access`, `openid`, `email`, `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite` (consentement administrateur si le locataire l'exige).

### 4.3 WhatsApp Business Cloud API — Meta
1. https://developers.facebook.com/apps → **Créer une app** → cas d'usage « Connecter avec les clients via WhatsApp » (type Business), rattachée à un **Business Manager** (portefeuille Meta Business vérifié pour la production).
2. Produit **WhatsApp → Configuration de l'API** : un numéro de test est fourni ; ajouter un vrai numéro (non déjà utilisé dans l'app WhatsApp grand public) pour la production.
3. Deux façons de connecter :
   - **Jeton fixe (recommandé pour démarrer)** : Business Manager → **Utilisateurs système** → créer un utilisateur système admin → lui assigner l'app et le compte WhatsApp → **Générer un jeton** avec `whatsapp_business_messaging`, `whatsapp_business_management` → `WHATSAPP_ACCESS_TOKEN` ; l'**identifiant du numéro** (Phone number ID) → `WHATSAPP_PHONE_NUMBER_ID`. (Ou coller jeton + Phone number ID dans l'UI.)
   - **OAuth / Embedded Signup** : produit **Facebook Login for Business** → URI de redirection OAuth valide `{APP_URL}/api/mcp/oauth/callback` ; créer une **configuration** (permissions `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`) → `META_CONFIG_ID` ; `META_APP_ID`, `META_APP_SECRET` (Paramètres → Général). Le numéro est découvert automatiquement (debug_token → WABA → phone_numbers).
4. **Webhook** (messages entrants → boîte unifiée) : WhatsApp → Configuration → URL de rappel `{APP_URL}/api/mcp/webhooks/whatsapp`, jeton de vérification = valeur de `WHATSAPP_VERIFY_TOKEN` (chaîne libre que vous choisissez) ; s'abonner au champ **messages**. Les requêtes sont vérifiées par signature `X-Hub-Signature-256` avec `META_APP_SECRET`.
5. Hors fenêtre de 24 h après le dernier message du client, seuls les **modèles approuvés** (`whatsapp_envoyer_modele`) sont autorisés par Meta.

### 4.4 Slack (API Web + serveur MCP Slack)
1. https://api.slack.com/apps → **Create New App → From scratch** → choisir l'espace de travail.
2. **OAuth & Permissions** : Redirect URL `{APP_URL}/api/mcp/oauth/callback` ; **Bot Token Scopes** : `channels:read`, `channels:history`, `groups:read`, `chat:write`, `users:read`.
3. **Basic Information** : Client ID → `SLACK_CLIENT_ID`, Client Secret → `SLACK_CLIENT_SECRET`.
4. Pour distribuer à d'autres espaces : **Manage Distribution** (et, pour le serveur MCP officiel Slack, l'app doit être interne ou publiée sur la Slack Marketplace — exigence Slack).
5. Le bot doit être invité dans un canal (`/invite @app`) pour y lire/publier.

### 4.5 Notion (API)
1. https://www.notion.so/profile/integrations → **Nouvelle intégration** → type **Publique**.
2. Renseigner le nom, le site, les liens politique de confidentialité / CGU (exigés pour une intégration publique) ; URI de redirection `{APP_URL}/api/mcp/oauth/callback`.
3. Capacités : lire, mettre à jour, insérer du contenu.
4. **OAuth client ID / secret** → `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`.
   Alternative : intégration **interne** et coller son jeton dans l'UI (partager les pages avec l'intégration).
   Le serveur MCP Notion (`https://mcp.notion.com/mcp`) ne demande rien : OAuth avec enregistrement dynamique.

### 4.6 HubSpot (API CRM + serveur MCP HubSpot)
1. Compte développeur HubSpot (https://developers.hubspot.com) → **Apps → Créer une app** (app publique / plateforme développeur).
2. **Auth** : URL de redirection `{APP_URL}/api/mcp/oauth/callback` ; scopes `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.deals.read`.
3. Client ID / secret → `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`. Alternative : **app privée** d'un portail et coller son jeton dans l'UI.
4. **Serveur MCP HubSpot** : dans le compte développeur, **Development → MCP Connectors** (« MCP auth app ») → même URL de redirection → `HUBSPOT_MCP_CLIENT_ID`, `HUBSPOT_MCP_CLIENT_SECRET` (PKCE géré automatiquement).

### 4.7 GitHub / Asana (MCP, facultatif)
- GitHub : sans OAuth, coller un **PAT** (fine-grained) dans l'UI. Pour OAuth : Settings → Developer settings → OAuth Apps → callback `{APP_URL}/api/mcp/oauth/callback` → `GITHUB_MCP_CLIENT_ID/SECRET`.
- Asana : si le serveur refuse l'enregistrement dynamique, créer l'app selon le guide MCP Asana → `ASANA_MCP_CLIENT_ID/SECRET`.

## 5. Variables d'environnement

| Variable | Rôle |
|---|---|
| `CONNECTORS_ENCRYPTION_KEY` | Clé AES-256 des secrets (32 octets base64/hex, `openssl rand -base64 32`). **Obligatoire en production** ; en dev dérivée de `AUTH_SECRET` (bandeau d'avertissement). |
| `CONNECTORS_SEND_MODE` | `simulation` / `live`. Défaut = `MAIL_MODE` (donc simulation). |
| `MCP_ALLOW_STDIO` | `true` : serveurs MCP locaux en stdio (dev, ignoré en prod). |
| `MCP_ALLOW_PRIVATE_NETWORK` | `true` : URL MCP sur réseau privé autorisées. |
| `APP_URL` | Base de l'URI de redirection et du webhook. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail + Google Agenda. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | Outlook / Graph (`common` par défaut). |
| `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` | WhatsApp via OAuth Meta ; `META_APP_SECRET` sert aussi à vérifier le webhook. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp par jeton d'utilisateur système (sans OAuth). |
| `WHATSAPP_VERIFY_TOKEN` | Jeton de vérification du webhook. |
| `WHATSAPP_GRAPH_VERSION` | Version Graph API (défaut `v23.0`). |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Slack API + serveur MCP Slack. |
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_VERSION` | Notion API (`2022-06-28` par défaut). |
| `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` | HubSpot API CRM. |
| `HUBSPOT_MCP_CLIENT_ID`, `HUBSPOT_MCP_CLIENT_SECRET` | Serveur MCP HubSpot. |
| `GITHUB_MCP_CLIENT_ID`, `GITHUB_MCP_CLIENT_SECRET` | OAuth GitHub MCP (facultatif). |
| `ASANA_MCP_CLIENT_ID`, `ASANA_MCP_CLIENT_SECRET` | OAuth Asana MCP (si exigé). |

## 6. Serveur MCP de Co-founder

- Point d'accès : `POST {APP_URL}/api/mcp/server` (Streamable HTTP sans état, réponses JSON). `GET`/`DELETE` → 405.
- Jeton : onglet Connecteurs → « Serveur MCP Co-founder » → créer un jeton (`cf_mcp_…`, affiché une seule fois, stocké haché SHA-256), portées :
  - `lecture` : recherche juridique, checklist, calendrier, score de conformité, veille, fournisseurs, tâches, boîte unifiée, connecteurs… ;
  - `ecriture` : création de tâches/documents, emails et devis **placés en approbation** ;
  - `approbation` : `lister_approbations`, `decider_approbation` (liée à un membre, journalisée).
- Exemple (Claude Desktop / Cursor / tout client MCP HTTP) :
```json
{ "mcpServers": { "cofounder": { "url": "https://<domaine>/api/mcp/server", "headers": { "Authorization": "Bearer cf_mcp_…" } } } }
```

## 7. Boîte unifiée (onglet Communications)

- Sources : Gmail / Outlook réellement connectés (« Synchroniser »), WhatsApp via webhook ; messages d'exemple pour les entreprises de démo.
- Classement par règles transparentes (administration, paiement, client, candidature, partenariat, fournisseur, promotion), priorité (urgence, administration, WhatsApp), raisons affichées.
- Réponse suggérée + actions routinières (accusé de réception, refus de candidature, relance de paiement, confirmation de partenariat). Envoi par le canal d'origine **après approbation** ; sans connecteur, l'email passe par `proposeExternalMessage` (boîte d'envoi du cœur, simulation par défaut).

## 8. Agent

- Outils statiques (registre `lib/agent/registry.ts`) : `connecteurs_lister`, `connecteurs_boite_unifiee`, `connecteurs_synchroniser_boite`, `connecteurs_preparer_reponse`.
- Outils dynamiques : chaque outil des connecteurs actifs est exposé au LLM sous `connecteurs_<id>_<outil>` (96 max) ; écritures → approbation.
- Mode démo : intentions « boîte / messages reçus / WhatsApp » et « connecteurs / MCP ».

## 9. Tests

`tests/mcp.test.ts` et `tests/mcp-native.test.ts` : tout le réseau est intercepté (`vi.stubGlobal("fetch", …)`), toute URL inattendue fait échouer le test — **aucun appel réel, aucun envoi réel**. Couvre : chiffrement, SSRF, catalogue, boucle complète client SDK ↔ serveur MCP Co-founder, découverte dynamique + approbation, OAuth MCP (DCR + PKCE), OAuth Google + refresh, Gmail (simulation et live mocké), webhook WhatsApp signé → réponse, Slack/Notion/HubSpot/Outlook, boîte unifiée, agent.
