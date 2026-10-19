import { getSnapshot } from "@/lib/workspace/service";
import { detectAnomalies } from "./analytics";
import { computeFinance } from "./finance";
import { citedMarkdown, citePoint } from "./legal";
import { riskProfile } from "./insights";
import { markdownToPdf } from "./pdf";
import { buildFinancialExport, fmt } from "./reports";
import { getState } from "./service";
import { writeZip } from "./zip";

/**
 * Data room investisseur générée automatiquement : statuts, pacte, conformité, chiffres, score.
 * Export ZIP (Markdown + CSV + PDF) ou PDF unique. Les pièces manquantes sont signalées, jamais inventées.
 */

export type DataRoomSection = { id: string; title: string; status: "present" | "manquant" | "partiel"; file: string; markdown: string; note?: string };
export type DataRoom = { company: string; generatedAt: string; score: number; scoreDetail: { label: string; points: number; max: number; detail: string }[]; sections: DataRoomSection[]; csv: { name: string; content: string }[]; isExample: boolean };

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export async function buildDataRoom(companyId: string, now = new Date()): Promise<DataRoom> {
  const st = await getState(companyId, now);
  const snap = await getSnapshot(companyId); // séquentiel : le store JSON ne supporte pas deux premiers chargements concurrents
  const finance = computeFinance(st.datasets, st.budgets, st.settings, now);
  const anomalies = detectAnomalies(st.datasets, now);
  const risk = await riskProfile(companyId, now);
  const investor = await buildFinancialExport(companyId, "investisseurs", now);
  const byDate = [...snap.documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const statuts = byDate.find((d) => d.kind === "statuts");
  const pacte = byDate.find((d) => /pacte/i.test(d.title));
  const bp = byDate.find((d) => d.kind === "business_plan");
  const pv = byDate.filter((d) => d.kind === "pv");
  const sectorLegal = await citePoint("dr_secteur", `Régime juridique du secteur « ${st.company.sector} »`, `régime juridique ${st.company.sectorKeywords.slice(0, 4).join(" ")} autorisation licence obligations`, 3, /licence|autorisation|declaration|agrement|concession/);
  const pacteLegal = await citePoint("dr_pacte", "Pacte d'associés et cession de parts", "pacte d'associés cession de parts sociales agrément associés", 3, /parts sociales|pacte d.associes|cession de parts/);

  const doc = (d: typeof statuts, title: string, missingHint: string) =>
    d
      ? `# ${title}\n\n_Document du workspace « ${d.title} », mis à jour le ${d.updatedAt.slice(0, 10)}${d.needsReview ? " — trame générée à faire valider par un professionnel" : ""}._\n\n${d.content}`
      : `# ${title}\n\n> ⚠️ **Pièce manquante.** ${missingHint}`;

  const sections: DataRoomSection[] = [
    { id: "statuts", title: "Statuts", status: statuts ? (statuts.needsReview ? "partiel" : "present") : "manquant", file: "01-statuts.md", markdown: doc(statuts, "Statuts", "Générez une trame avec l'agent (« génère les statuts ») puis faites-la valider et signer."), note: statuts?.needsReview ? "Trame à valider" : undefined },
    { id: "pacte", title: "Pacte d'associés", status: pacte ? "present" : "manquant", file: "02-pacte-associes.md", markdown: `${doc(pacte, "Pacte d'associés", "Aucun document intitulé « pacte » dans le workspace. Rédigez-le avec votre conseil et déposez-le dans Documents.")}\n\n## Fondement juridique\n${citedMarkdown(pacteLegal)}` },
    {
      id: "conformite",
      title: "Conformité",
      status: snap.compliance.score >= 65 ? "present" : "partiel",
      file: "03-conformite.md",
      markdown: [
        "# Conformité",
        "",
        `- Score de conformité : **${snap.compliance.score}/100** (${snap.compliance.level})`,
        ...snap.compliance.breakdown.map((b) => `- ${b.label} : ${b.points}/${b.max} — ${b.detail}`),
        "",
        "## Démarches de création",
        ...snap.checklist.map((c) => `- [${c.status === "fait" ? "x" : " "}] ${c.title} (${c.status})${c.isExample ? " — étape générique d'exemple" : ""}`),
        "",
        "## Obligations",
        ...snap.obligations.map((o) => `- ${o.dueDate.slice(0, 10)} — ${o.title}${o.done ? " (fait)" : ""}${o.isExample ? " — exemple" : ""}`),
        "",
        "## Régime sectoriel (corpus officiel)",
        citedMarkdown(sectorLegal),
        ...(pv.length ? ["", "## Procès-verbaux", ...pv.map((p) => `- ${p.title} (${p.updatedAt.slice(0, 10)})`)] : []),
      ].join("\n"),
    },
    { id: "chiffres", title: "Chiffres clés et trésorerie", status: finance.hasData ? (finance.isExample ? "partiel" : "present") : "manquant", file: "04-chiffres.md", markdown: investor.markdown, note: finance.isExample ? "Données d'exemple" : undefined },
    { id: "business_plan", title: "Business plan", status: bp ? "present" : "manquant", file: "05-business-plan.md", markdown: doc(bp, "Business plan", "Générez-le avec l'agent (« génère le business plan »).") },
    {
      id: "risques",
      title: "Risques et anomalies",
      status: "present",
      file: "06-risques.md",
      markdown: ["# Profil de risque", "", `Global : **${risk.overall}/100** (${risk.level})`, "", ...risk.axes.flatMap((a) => [`## ${a.label} — ${a.score}/100`, ...a.drivers.map((d) => `- ${d}`), "Mesures :", ...a.strategies.slice(0, 3).map((s) => `- ${s}`), ""]), "## Anomalies ouvertes", ...(anomalies.length ? anomalies.slice(0, 10).map((a) => `- [${a.severity}] ${a.title} — ${a.detail}`) : ["- Aucune"])].join("\n"),
    },
  ];

  const scoreDetail = [
    { label: "Statuts", points: statuts ? (statuts.needsReview ? 10 : 20) : 0, max: 20, detail: statuts ? (statuts.needsReview ? "trame à valider" : "présents") : "manquants" },
    { label: "Pacte d'associés", points: pacte ? 15 : 0, max: 15, detail: pacte ? "présent" : "manquant" },
    { label: "Business plan", points: bp ? 10 : 0, max: 10, detail: bp ? "présent" : "manquant" },
    { label: "Chiffres réels importés", points: finance.hasData ? (finance.isExample ? 5 : 20) : 0, max: 20, detail: finance.hasData ? (finance.isExample ? "données d'exemple uniquement" : "journal financier importé") : "aucune donnée" },
    { label: "Conformité", points: Math.round(snap.compliance.score * 0.2), max: 20, detail: `${snap.compliance.score}/100` },
    { label: "Qualité des données", points: anomalies.some((a) => a.severity === "critique") ? 0 : 5, max: 5, detail: `${anomalies.filter((a) => a.severity === "critique").length} anomalie(s) critique(s)` },
    { label: "Trésorerie", points: finance.alerts.some((a) => a.severity === "critique") ? 0 : 10, max: 10, detail: finance.alerts.some((a) => a.severity === "critique") ? "risque de trésorerie signalé" : "pas d'alerte critique" },
  ];
  const score = scoreDetail.reduce((s, x) => s + x.points, 0);
  return { company: st.company.name, generatedAt: now.toISOString(), score, scoreDetail, sections, csv: investor.csv, isExample: Boolean(st.company.isExample) || finance.isExample };
}

export function dataRoomIndex(dr: DataRoom): string {
  return [
    `# Data room investisseur — ${dr.company}`,
    "",
    `Générée le ${new Date(dr.generatedAt).toLocaleString("fr-FR", { timeZone: "Africa/Douala" })} (heure de Douala) par Co-founder.`,
    dr.isExample ? "\n> ⚠️ Contient des données d'EXEMPLE (fictives) : ne pas transmettre en l'état à un investisseur.\n" : "",
    `## Score de préparation : ${dr.score}/100`,
    "| Critère | Points | Détail |",
    "|---|---|---|",
    ...dr.scoreDetail.map((s) => `| ${s.label} | ${s.points}/${s.max} | ${s.detail} |`),
    "",
    "## Contenu",
    ...dr.sections.map((s) => `- ${s.file} — ${s.title} : ${s.status === "present" ? "présent" : s.status === "partiel" ? "partiel" : "MANQUANT"}${s.note ? ` (${s.note})` : ""}`),
    ...dr.csv.map((c) => `- chiffres/${c.name}`),
    "- data-room.pdf — version PDF consolidée",
  ].join("\n");
}

export function dataRoomPdf(dr: DataRoom): Buffer {
  const md = [dataRoomIndex(dr), ...dr.sections.map((s) => s.markdown)].join("\n\n");
  return markdownToPdf(md, `Data room — ${dr.company}`, `Co-founder · data room ${dr.company}`);
}

export function dataRoomZip(dr: DataRoom): { name: string; data: Buffer } {
  const root = `data-room-${slug(dr.company) || "entreprise"}`;
  const files = [
    { name: `${root}/00-index.md`, data: dataRoomIndex(dr) },
    ...dr.sections.map((s) => ({ name: `${root}/${s.file}`, data: s.markdown })),
    ...dr.csv.map((c) => ({ name: `${root}/chiffres/${c.name}`, data: c.content })),
    { name: `${root}/data-room.pdf`, data: dataRoomPdf(dr) },
  ];
  return { name: `${root}.zip`, data: writeZip(files, new Date(dr.generatedAt)) };
}

export { fmt };
