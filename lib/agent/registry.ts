import type { Company } from "@/lib/workspace/types";
import { TOOLS as CORE_TOOLS, type AgentTool, type ToolContext, type ToolResult } from "./tools";

/**
 * REGISTRE DES OUTILS DE L'AGENT — point d'extension unique pour les modules.
 *
 * Convention (voir /workspace/hackaton-plan/conventions.md) :
 *  - chaque module exporte `agentModule: AgentModule` depuis lib/modules/<module>/agent.ts ;
 *  - on l'ajoute ici avec DEUX lignes : un import et une entrée en fin de MODULES ;
 *  - noms d'outils en snake_case français, préfixés par le module (ex. `fund_lister_programmes`) ;
 *  - les outils qui touchent au droit appellent `legalBasis()` (lib/agent/tools.ts) et renvoient `fondement_juridique` ;
 *  - les actions externes passent par `proposeExternalMessage()` (lib/workspace/actions.ts) → file d'approbation + feu vert juridique.
 * L'outil `rechercher_textes_juridiques` reste TOUJOURS le premier de la liste.
 */
export type DemoCall = (name: string, input: Record<string, unknown>) => Promise<ToolResult | null>;

/** Intention du planificateur démo (sans clé IA) : détectée par regex sur le message normalisé (sans accents, minuscules). */
export type DemoIntent = {
  name: string;
  test: RegExp;
  /** Appelle les outils via `call` et renvoie le paragraphe de réponse (Markdown) ou null. */
  run: (args: { company: Company; message: string; call: DemoCall; ctx: ToolContext }) => Promise<string | null>;
};

export type AgentModule = { id: string; tools: AgentTool[]; intents?: DemoIntent[] };

import { agentModule as structure } from "@/lib/modules/structure/agent";
import { agentModule as lawWatch } from "@/lib/modules/law-watch/agent";
// ↓ imports des modules : une ligne par module
import { agentModule as connecteurs } from "@/lib/modules/mcp/agent";

const MODULES: AgentModule[] = [
  { id: "core", tools: CORE_TOOLS },
  structure,
  lawWatch,
  // ↓ modules : une ligne par module, ajoutée en fin de liste
  connecteurs,
];

export const AGENT_MODULES = MODULES;
export const ALL_TOOLS: AgentTool[] = MODULES.flatMap((m) => m.tools);
export const TOOL_MAP = new Map(ALL_TOOLS.map((t) => [t.name, t]));
export const DEMO_INTENTS: DemoIntent[] = MODULES.flatMap((m) => m.intents ?? []);
export type { AgentTool, ToolContext, ToolResult };
