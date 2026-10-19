/**
 * Modules agent de l'équipe « entrepreneur » (convention lib/agent/registry.ts) : un AgentModule par onglet
 * (idea, fund, team, mentor, market). Les outils sont ceux de ./tools (mêmes fonctions que l'API de l'UI).
 */
import type { AgentModule, AgentTool } from "@/lib/agent/registry";
import { demoIntentsFor } from "./demo";
import { ENTREPRENEUR_TOOLS } from "./tools";

const toolsFor = (prefix: string): AgentTool[] => ENTREPRENEUR_TOOLS.filter((t) => t.name.startsWith(`${prefix}_`)).map((t) => ({ ...t, run: (input, ctx) => t.run(input, ctx) }));

export const ideaModule: AgentModule = { id: "idea", tools: toolsFor("idea"), intents: demoIntentsFor("idee", "idea_diagnostic") };
export const fundModule: AgentModule = { id: "fund", tools: toolsFor("fund"), intents: demoIntentsFor("financement", "fund_financements") };
export const teamModule: AgentModule = { id: "team", tools: toolsFor("team"), intents: demoIntentsFor("equipe", "team_recrutement") };
export const mentorModule: AgentModule = { id: "mentor", tools: toolsFor("mentor"), intents: demoIntentsFor("mentor", "mentor_reseau") };
export const marketModule: AgentModule = { id: "market", tools: toolsFor("market"), intents: demoIntentsFor("b2b", "market_b2b") };
