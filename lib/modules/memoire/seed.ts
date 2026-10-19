import { log } from "@/lib/workspace/service";
import { newId, readData, withData } from "@/lib/workspace/store";
import { analyzeTranscriptDemo } from "./analyze";
import { snapshotLegal } from "./legal";
import { applyAnalysis, insertDecision, memo, readMemo } from "./store";
import type { LegalSnapshot, Meeting } from "./types";

/**
 * SEED DE DÉMONSTRATION du module mémoire pour l'entreprise fictive « Kmer Logistik (démo) ».
 * Réunion, décisions et motivations sont FICTIVES (marquées exemple). Les références juridiques ne sont pas
 * écrites à la main : elles sont recherchées dans le corpus au moment du seed (ou « non couvert »).
 */
export const SEED_COMPANY = "co_kmerlog";

export const SEED_TRANSCRIPT = `[00:00] Freddy : Bienvenue à la réunion de lancement de Kmer Logistik (exemple de démonstration).
[00:02] Freddy : Premier point, la structure juridique de la société.
[00:04] Awa : Une entreprise individuelle serait plus simple à créer, mais tout reposerait sur une seule personne.
[00:06] Paul : Une SAS serait plus souple si nous faisons entrer un investisseur plus tard.
[00:09] Freddy : On a décidé de constituer la société sous forme de SARL, car nous sommes trois associés et nous voulons une gouvernance simple avec un gérant.
[00:12] Awa : Côté activité, les e-commerçants d'Akwa et de Bonapriso nous demandent de la livraison le jour même.
[00:15] Freddy : On retient la livraison de colis pour les e-commerçants de Douala comme activité de départ, parce que la demande est déjà exprimée par nos premiers clients.
[00:18] Paul : Il faudra vérifier le régime applicable aux services de colis et de courrier express avant de démarrer.
[00:20] Awa doit rédiger le projet de statuts de la SARL dans 7 jours.
[00:22] Paul : Je vais demander trois devis de motos de livraison dans 10 jours.
[00:24] Freddy : Action : Freddy — vérifier dans le corpus le régime d'autorisation des services postaux dans 3 semaines.`;

const PEOPLE = [
  { id: "mem_freddy", name: "Freddy Choudja" },
  { id: "mem_awa", name: "Awa Mbarga (démo)" },
  { id: "mem_paul", name: "Paul Etoa (démo)" },
];

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 0, 0, 0);
  return d;
};

/** Injecte le seed une seule fois par entreprise de démo (idempotent, sans effet sur les entreprises réelles). */
export async function ensureMemoireSeed(companyId: string): Promise<void> {
  if (companyId !== SEED_COMPANY) return;
  const snapshot = await readData();
  const company = snapshot.companies.find((c) => c.id === companyId);
  if (!company?.isExample || readMemo(snapshot).seeded.includes(companyId)) return;

  const meetingDate = daysAgo(14);
  const analysis = analyzeTranscriptDemo(SEED_TRANSCRIPT, PEOPLE, meetingDate);
  // Instantanés juridiques recherchés dans le corpus (hors verrou d'écriture).
  const legalForm = await snapshotLegal("forme juridique société SARL associés gérant statuts capital social");
  const meetingLegal: LegalSnapshot[] = [];
  for (const d of analysis.decisions) meetingLegal.push(/SARL/i.test(d.title) ? legalForm : await snapshotLegal(`${d.title} colis courrier express régime autorisation postal`));
  const payment = await snapshotLegal("paiement mobile monnaie électronique encaissement");

  await withData((data) => {
    const m = memo(data);
    if (m.seeded.includes(companyId)) return;
    m.seeded.push(companyId);
    const t = meetingDate.toISOString();
    const meeting: Meeting = {
      id: newId("reu"),
      companyId,
      title: "Réunion de lancement (démo)",
      date: t,
      participants: PEOPLE.map((p) => p.name),
      transcript: SEED_TRANSCRIPT,
      source: "texte",
      status: "en_cours",
      decisionIds: [],
      taskIds: [],
      isExample: true,
      createdBy: "mem_freddy",
      createdAt: t,
      updatedAt: t,
    };
    m.meetings.unshift(meeting);
    applyAnalysis(data, meeting, analysis, meetingLegal, "system");
    // Enrichit la décision « structure juridique » : alternatives discutées pendant la réunion.
    const legal = m.decisions.find((d) => d.meetingId === meeting.id && /SARL/i.test(d.title));
    if (legal) {
      legal.title = "Structure juridique : SARL";
      legal.alternatives = ["Entreprise individuelle — écartée : tout reposerait sur une seule personne (réunion du lancement)", "SAS — reportée : plus souple pour l'entrée d'un investisseur, à réexaminer avant une levée de fonds"];
      legal.tags = ["juridique", "structure", "forme sociale"];
    }
    // Historique d'exécution fictif des tâches (sert d'exemple au Score Co-founder).
    const tasks = data.tasks.filter((x) => meeting.taskIds.includes(x.id));
    const statuts = tasks.find((x) => /statuts/i.test(x.title));
    if (statuts) {
      statuts.status = "fait";
      data.activity.unshift({ id: newId("act"), companyId, actor: "mem_awa", action: "tache.statut", details: `« ${statuts.title} » → fait.`, createdAt: daysAgo(8).toISOString() });
    }
    const devis = tasks.find((x) => /devis/i.test(x.title));
    if (devis) {
      devis.status = "fait";
      data.activity.unshift({ id: newId("act"), companyId, actor: "mem_paul", action: "tache.statut", details: `« ${devis.title} » → fait.`, createdAt: daysAgo(2).toISOString() });
    }
    insertDecision(
      data,
      companyId,
      {
        title: "Encaissement par mobile money",
        decision: "Proposer l'encaissement à la livraison par mobile money pour les e-commerçants clients.",
        rationale: "Demande exprimée dans la note de cadrage : les e-commerçants veulent un encaissement immédiat et traçable (exemple de démonstration).",
        alternatives: ["Paiement en espèces uniquement — écarté : risque de manipulation d'espèces par les livreurs"],
        status: "adoptee",
        decidedAt: daysAgo(12).toISOString(),
        decidedBy: "Freddy Choudja",
        sources: [{ type: "document", id: "doc_note1", label: "Note de cadrage (démo)" }],
        tags: ["paiement"],
        isExample: true,
      },
      payment,
      "system",
    );
    log(data, companyId, "system", "memoire.seed", "Mémoire organisationnelle de démonstration initialisée (réunion et décisions fictives).");
  });
}
