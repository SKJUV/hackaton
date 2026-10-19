import type { AgentModule } from "@/lib/agent/registry";
import { ENTREPRISE_DEMO_INTENT } from "./demo";
import { ENTREPRISE_TOOLS } from "./tools";

/**
 * Module « Entreprise » (niveau 2) : données, tableau financier, veille & risques, due diligence, data room.
 * Outils préfixés `entreprise_` ; aucun n'envoie quoi que ce soit à un tiers.
 */
export const agentModule: AgentModule = { id: "entreprise", tools: ENTREPRISE_TOOLS, intents: [ENTREPRISE_DEMO_INTENT] };
