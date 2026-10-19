import type { AgentModule } from "@/lib/agent/registry";
import { MCP_AGENT_TOOLS } from "./agent-tools";

type InboxRow = { de: string; objet?: string; extrait: string; priorite: string; categorie: string; routine?: string; exemple: boolean };

/**
 * Module « connecteurs » (équipe mcp-connecteurs) : outils statiques de l'agent + intentions du mode démo.
 * Les outils dynamiques des connecteurs branchés (connecteurs_<id>_<outil>) sont injectés par runner.ts (ctx.extraTools).
 */
export const agentModule: AgentModule = {
  id: "connecteurs",
  tools: MCP_AGENT_TOOLS,
  intents: [
    {
      name: "connecteurs_boite",
      test: /\b(boite (de reception|unifiee)|inbox|e-?mails? recus|messages? recus|whatsapp|non lus?|repondre aux (messages|emails|clients))\b/,
      async run({ call }) {
        const r = await call("connecteurs_boite_unifiee", {});
        if (!r) return null;
        const msgs = ((r.data as InboxRow[]) ?? []).slice(0, 5);
        return `📥 ${r.summary} :\n${msgs.map((m) => `- [${m.priorite}] ${m.de} — ${m.objet ?? m.extrait.slice(0, 60)} (${m.categorie}${m.routine ? `, action suggérée : ${m.routine.replace(/_/g, " ")}` : ""})${m.exemple ? " — exemple" : ""}`).join("\n")}\nOuvrez l'onglet **Communications** pour valider les réponses suggérées (envoi uniquement après approbation).`;
      },
    },
    {
      name: "connecteurs_liste",
      test: /\b(connecteurs?|mcp|integrations?)\b/,
      async run({ call }) {
        const r = await call("connecteurs_lister", {});
        return r ? `🔌 ${r.summary}. Gérez-les dans l'onglet **Connecteurs MCP** (serveurs MCP, Gmail, Google Agenda, Outlook, WhatsApp, Slack, Notion, HubSpot).` : null;
      },
    },
  ],
};
