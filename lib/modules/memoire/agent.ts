import type { AgentModule, DemoIntent } from "@/lib/agent/registry";
import { memoireIntents, runMemoireIntent } from "./demo";
import { MEMOIRE_TOOLS } from "./tools";

/**
 * Le routage démo du module dépend de plusieurs signaux (nombre de lignes d'une transcription, horodatages,
 * priorités entre « PV », « score », « pourquoi »…) : on l'expose au registre sous forme d'un RegExp dont
 * `test()` délègue à memoireIntents(). Une seule intention du module s'exécute par message.
 */
class IntentMatcher extends RegExp {
  constructor(private readonly accept: (intent: string) => boolean) {
    super("memoire");
  }
  override test(text: string): boolean {
    const found = memoireIntents(text)?.[0];
    return Boolean(found && this.accept(found));
  }
}

/**
 * Exclusives : une transcription collée contient « devis », « email », « statuts »… qui ne doivent déclencher
 * ni demande de devis, ni email, ni génération de document du cœur ; « PV de la réunion » ne doit pas générer
 * un PV d'assemblée générale juridique.
 */
const EXCLUSIVE = new Set(["reunion_analyse", "pv"]);

const make = (exclusive: boolean): DemoIntent => ({
  name: exclusive ? "memoire_reunion" : "memoire",
  test: new IntentMatcher((i) => EXCLUSIVE.has(i) === exclusive),
  exclusive,
  async run({ company, message, call }) {
    const name = memoireIntents(message)?.[0];
    if (!name || EXCLUSIVE.has(name) !== exclusive) return null;
    const lines: string[] = [];
    await runMemoireIntent(name, { company, message, call, lines });
    return lines.join("\n\n") || null;
  },
});

export const agentModule: AgentModule = { id: "memoire", tools: MEMOIRE_TOOLS, intents: [make(true), make(false)] };
