# Plan — Droit.cm → « Co-fondateur IA » agentique

## Architecture cible
```
app/
  page.tsx                  chat juridique existant (conservé) + lien Workspace
  workspace/page.tsx        Workspace entreprise (SPA client, onglets)
  api/agent/route.ts        boucle agent (function-calling Groq/Gemini, sinon planificateur seed)
  api/workspace/**          REST : entreprises, membres, documents, tâches, fournisseurs, devis,
                            boîte d'envoi, approbations, journal, conformité, veille, calendrier
lib/
  store/                    persistance JSON fichier (data/workspace.db.json) derrière un repository
                            → remplaçable par Postgres/SQLite sans toucher aux routes
  agent/                    tools.ts (registre + schémas JSON), runner.ts (boucle LLM), seed-planner.ts
  mail/                     fournisseurs : simulation (défaut) | Resend | SMTP ; MAIL_MODE
  legal/                    corpus.ts (officiel indexé + seed EXEMPLE), citations d'articles
  cofounder/                business plan, roadmap, checklist création, statuts/contrats
  compliance/               score de conformité, calendrier fiscal, veille réglementaire
corpus/
  officiel/                 dépôt des textes fournis par l'État (PDF/MD/JSON) → ingestion
  exemples/                 seeds marqués « EXEMPLE — non officiel »
```

Principe clé : **l'agent propose, l'humain dispose**. Toute action externe (email, demande de devis) crée un brouillon + une entrée dans la file d'approbation ; l'exécution se fait à la validation. Tout est journalisé (audit).

## Lots
1. **Socle** : report des citations de `main`, store JSON, modèle de données workspace, seed (entreprise démo, membres, fournisseurs exemple).
2. **Agent** : registre d'outils (≈15), boucle function-calling Groq (OpenAI tools) + Gemini (functionDeclarations), planificateur seed sans clé (même outils, même traces).
3. **Email & fournisseurs** : boîte d'envoi, brouillons, approbation, envoi simulation/Resend/SMTP ; annuaire fournisseurs, demandes de devis, suivi, relances.
4. **Co-fondateur** : business plan, roadmap, checklist création d'entreprise avec suivi des démarches.
5. **Juridique** : recherche sur corpus officiel indexé + seed exemple, citations article/page, couche d'ingestion `corpus/officiel`.
6. **Workspace UI** : multi-entreprise, membres/rôles, documents, journal, approbations.
7. **Innovations** (ci-dessous). 8. **Tests (vitest) + docs FR**.

## Innovations retenues
| Innovation | Pourquoi |
|---|---|
| File d'approbation + journal d'audit | Confiance : l'agent agit mais rien ne sort sans validation ; traçabilité pour les investisseurs/contrôles |
| Score de conformité | Un chiffre actionnable (checklist, obligations, documents) ; montre au startuper où il en est |
| Calendrier des obligations | Échéances (fiscales/sociales/sectorielles) → tâches et relances automatiques |
| Veille réglementaire | Croise le secteur de l'entreprise avec le corpus (nouveaux textes ingérés) → alertes |
| Générateur de statuts / contrats | Modèles pré-remplis depuis le profil entreprise, enregistrés dans Documents (à faire valider) |
| Comparateur de devis | Classe les réponses fournisseurs (prix, délai) pour décider vite |
| Briefing quotidien « co-fondateur » | Résumé : priorités, échéances, approbations en attente, alertes |
