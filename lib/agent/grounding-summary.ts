import { groundingLabel, type Grounding, type GroundingSource, type GroundingStatus } from "@/lib/legal/grounding";

/** Ancrage juridique de la réponse, affiché dans l'UI (« Fondé sur… » / « Non couvert par le corpus »). */
export type ReplyGrounding = { status: GroundingStatus; label: string; query: string; sources: GroundingSource[]; actions: { query: string; status: GroundingStatus; label: string }[] };
/** La première recherche porte sur la question de l'utilisateur : c'est elle qui qualifie la réponse. */
export function summarizeGrounding(groundings: Grounding[] | undefined): ReplyGrounding | null {
  if (!groundings?.length) return null;
  const [primary, ...rest] = groundings;
  return {
    status: primary.status,
    label: groundingLabel(primary),
    query: primary.query,
    sources: primary.sources,
    actions: rest.map((g) => ({ query: g.query, status: g.status, label: groundingLabel(g) })),
  };
}
