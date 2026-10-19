import { corpusFingerprint } from "@/lib/legal/fingerprint";
import { groundingMarkdown, groundQuery } from "@/lib/legal/grounding";
import { moduleState, forCompany } from "@/lib/modules/state";
import { log, WorkspaceError } from "@/lib/workspace/service";
import { nowIso, readData, withData } from "@/lib/workspace/store";
import type { WorkspaceDocument } from "@/lib/workspace/types";

/**
 * ALERTE DE CHANGEMENT DE LOI — quand le corpus officiel est ré-ingéré, on compare l'empreinte de chaque
 * texte source avec celle enregistrée lors de la génération des documents ; les documents impactés sont
 * signalés et une mise à jour de leur fondement juridique est proposée (jamais appliquée sans action humaine).
 */
type SimulatedChange = { id: string; companyId: string; file: string; at: string; isExample: true };
const seed = () => ({ simulated: [] as SimulatedChange[] });
const state = (d: Parameters<typeof moduleState>[0]) => moduleState(d, "law-watch", seed);

export type LawImpact = { documentId: string; title: string; files: string[]; status: NonNullable<WorkspaceDocument["lawChange"]>["status"]; detectedAt: string; simulated: boolean };

function changedFiles(doc: WorkspaceDocument, current: Record<string, string>, simulated: SimulatedChange[]): { files: string[]; simulated: boolean } {
  const real = Object.entries(doc.corpusHashes ?? {}).filter(([f, h]) => current[f] !== h).map(([f]) => f);
  const sim = simulated.filter((s) => s.companyId === doc.companyId && doc.corpusHashes?.[s.file]).map((s) => s.file);
  return { files: [...new Set([...real, ...sim])], simulated: sim.length > 0 && real.length === 0 };
}

/** Détecte les documents impactés et pose une alerte « à revoir » sur les nouveaux cas. */
export async function scanLawChanges(companyId: string): Promise<{ impacts: LawImpact[]; scannedDocuments: number; corpusFiles: number }> {
  const current = await corpusFingerprint();
  return withData((data) => {
    const sims = state(data).simulated;
    const docs = forCompany(data.documents, companyId).filter((d) => d.corpusHashes && Object.keys(d.corpusHashes).length);
    const impacts: LawImpact[] = [];
    for (const doc of docs) {
      const { files, simulated } = changedFiles(doc, current, sims);
      if (!files.length) continue;
      const same = (a: string[], b: string[]) => a.length === b.length && a.every((f) => b.includes(f));
      if (doc.lawChange?.status === "ignore" && same(doc.lawChange.files, files)) continue;
      if (!doc.lawChange || doc.lawChange.status !== "a_revoir") {
        doc.lawChange = { detectedAt: nowIso(), files, status: "a_revoir" };
        log(data, companyId, "system", "loi.changement", `${simulated ? "[DÉMO] " : ""}Texte source modifié : « ${doc.title} » est à revoir (${files.join(", ")}).`);
      }
      impacts.push({ documentId: doc.id, title: doc.title, files, status: doc.lawChange.status, detectedAt: doc.lawChange.detectedAt, simulated });
    }
    return { impacts, scannedDocuments: docs.length, corpusFiles: Object.keys(current).length };
  });
}

/** Régénère la section « Fondement juridique » sur le corpus actuel et met à jour l'empreinte. */
export async function updateDocumentLegalBasis(companyId: string, documentId: string, actor = "utilisateur") {
  const data = await readData();
  const doc = data.documents.find((d) => d.id === documentId && d.companyId === companyId);
  if (!doc) throw new WorkspaceError("Document introuvable.", 404);
  const g = await groundQuery(doc.legalQuery ?? doc.title, 4);
  const current = await corpusFingerprint();
  const files = g.sources.filter((x) => !x.isExample).map((x) => x.file);
  return withData((d) => {
    const target = d.documents.find((x) => x.id === documentId)!;
    const base = target.content.split("\n## Fondement juridique (corpus officiel)")[0].trimEnd();
    target.content = `${base}\n${groundingMarkdown(g)}\n\n_Fondement mis à jour le ${new Date().toLocaleDateString("fr-FR")} après modification du corpus officiel._`;
    target.legalSources = g.sources.map((x) => ({ file: x.file, page: x.page, document: x.document, isExample: x.isExample }));
    target.corpusHashes = Object.fromEntries(files.filter((f) => current[f]).map((f) => [f, current[f]]));
    const resolved = target.lawChange?.files ?? [];
    target.lawChange = { detectedAt: target.lawChange?.detectedAt ?? nowIso(), files: resolved, status: "mis_a_jour", resolvedAt: nowIso() };
    target.updatedAt = nowIso();
    target.needsReview = true;
    const st = state(d);
    st.simulated = st.simulated.filter((s) => !(s.companyId === companyId && resolved.includes(s.file)));
    log(d, companyId, actor, "loi.mise_a_jour", `Fondement juridique de « ${target.title} » mis à jour sur le corpus actuel.`);
    return target;
  });
}

export async function ignoreLawChange(companyId: string, documentId: string, actor = "utilisateur") {
  return withData((d) => {
    const doc = d.documents.find((x) => x.id === documentId && x.companyId === companyId);
    if (!doc?.lawChange) throw new WorkspaceError("Aucune alerte sur ce document.", 404);
    doc.lawChange = { ...doc.lawChange, status: "ignore", resolvedAt: nowIso() };
    const st = state(d);
    st.simulated = st.simulated.filter((s) => !(s.companyId === companyId && doc.lawChange!.files.includes(s.file)));
    log(d, companyId, actor, "loi.ignore", `Alerte de changement de loi ignorée pour « ${doc.title} ».`);
    return doc;
  });
}

/** DÉMO : simule la modification d'un texte source utilisé par un document (aucun texte réel n'est modifié). */
export async function simulateLawChange(companyId: string) {
  return withData((d) => {
    const doc = forCompany(d.documents, companyId).find((x) => x.corpusHashes && Object.keys(x.corpusHashes).length);
    if (!doc) throw new WorkspaceError("Aucun document ancré dans le corpus : générez d'abord un document (statuts, pacte, business plan…).", 409);
    const file = Object.keys(doc.corpusHashes!)[0];
    state(d).simulated.push({ id: `sim_${Date.now().toString(36)}`, companyId, file, at: nowIso(), isExample: true });
    log(d, companyId, "system", "loi.simulation", `[DÉMO] Modification simulée du texte ${file}.`);
    return { file, documentId: doc.id };
  });
}
