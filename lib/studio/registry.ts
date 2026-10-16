/**
 * Point d'accueil des modules issus de Noah12345578/ai-cofounder-studio.
 *
 * Tout ce qui est enregistré ici est servi derrière le paywall (`/api/studio`, onglet « Studio co-fondateur »
 * du workspace). Chaque module doit citer sa provenance (dépôt, branche, commit) et la licence.
 */
export type StudioModule = {
  id: string;
  title: string;
  description: string;
  provenance: { repo: string; branch: string; commit: string; license: string | null };
};

export const STUDIO_SOURCE = {
  repo: "https://github.com/Noah12345578/ai-cofounder-studio",
  fork: "https://github.com/arispacco/ai-cofounder-studio",
  expectedBranch: "ai-cofounder",
};

/** Modules intégrés. Vide tant que le push de la branche ai-cofounder n'est pas arrivé. */
export const STUDIO_MODULES: StudioModule[] = [];

export function studioStatus() {
  return {
    source: STUDIO_SOURCE,
    modules: STUDIO_MODULES,
    state: STUDIO_MODULES.length ? ("integre" as const) : ("en_attente" as const),
  };
}
