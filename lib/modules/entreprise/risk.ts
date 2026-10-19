import { sumBy } from "./analytics";
import type { FinanceView } from "./finance";
import type { CitedPoint } from "./legal";
import type { Anomaly, Dataset, Severity } from "./types";

/** Profil de risque : change, crédit client, opérationnel, réglementaire (+ liquidité). Scores 0–100 (100 = risque maximal). */

export type RiskAxis = {
  id: "change" | "credit_client" | "operationnel" | "reglementaire" | "liquidite";
  label: string;
  score: number;
  level: "faible" | "modere" | "eleve" | "critique";
  drivers: string[];
  strategies: string[];
  basis: "donnees" | "parametre" | "exemple" | "insuffisant";
  legal?: CitedPoint;
};

export type RiskProfile = { overall: number; level: RiskAxis["level"]; axes: RiskAxis[]; alerts: { severity: Severity; title: string; detail: string }[]; isExample: boolean };

const level = (s: number): RiskAxis["level"] => (s >= 75 ? "critique" : s >= 55 ? "eleve" : s >= 30 ? "modere" : "faible");
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const today = (now: Date) => now.toISOString().slice(0, 10);

export function computeRiskProfile(input: {
  datasets: Dataset[];
  finance: FinanceView;
  anomalies: Anomaly[];
  compliance: { score: number; recommendations: string[] };
  overdueObligations: number;
  regulatedLegal?: CitedPoint;
  now?: Date;
}): RiskProfile {
  const { datasets, finance, anomalies, compliance } = input;
  const now = input.now ?? new Date();
  const axes: RiskAxis[] = [];

  // Change
  const fx = finance.settings.fxShare;
  axes.push({
    id: "change",
    label: "Risque de change",
    score: clamp(fx * 110),
    level: level(clamp(fx * 110)),
    drivers: [`${Math.round(fx * 100)} % des achats estimés en devises étrangères${finance.settings.isExample ? " (paramètre d'exemple, à ajuster)" : ""}.`, "Information générale : le franc CFA (XAF) a une parité fixe avec l'euro ; l'exposition porte surtout sur les devises hors euro (USD, CNY…)."],
    strategies: ["Négocier la facturation des fournisseurs en XAF ou en EUR.", "Prévoir des clauses d'indexation ou de révision de prix dans les contrats clients.", "Constituer un stock tampon avant les périodes de forte volatilité.", "Demander à sa banque les solutions de couverture à terme disponibles."],
    basis: finance.settings.isExample ? "exemple" : "parametre",
  });

  // Crédit client
  const clients = datasets.filter((d) => d.domain === "clients").flatMap((d) => d.rows);
  const ventes = datasets.filter((d) => d.domain === "ventes").flatMap((d) => d.rows);
  if (clients.length) {
    const total = clients.reduce((s, r) => s + (r.encours ?? 0), 0) || 1;
    const late60 = clients.filter((r) => (r.jours_retard ?? 0) >= 60).reduce((s, r) => s + (r.encours ?? 0), 0) / total;
    const weighted = clients.reduce((s, r) => s + (r.encours ?? 0) * (r.jours_retard ?? 0), 0) / total;
    const top = Math.max(...clients.map((r) => r.encours ?? 0)) / total;
    const score = clamp(late60 * 70 + top * 40 + weighted * 0.4);
    axes.push({
      id: "credit_client",
      label: "Risque de crédit client",
      score,
      level: level(score),
      drivers: [`${Math.round(late60 * 100)} % de l'encours a plus de 60 jours de retard.`, `Retard moyen pondéré : ${Math.round(weighted)} jours.`, `Premier client : ${Math.round(top * 100)} % de l'encours.`],
      strategies: ["Exiger un acompte ou le paiement à la livraison (mobile money) pour les nouveaux clients.", "Relances graduées à J+15, J+30, J+45 puis mise en demeure.", "Plafond d'encours par client et suspension des livraisons au-delà.", "Diversifier le portefeuille pour réduire la dépendance au premier client."],
      basis: datasets.some((d) => d.domain === "clients" && d.isExample) ? "exemple" : "donnees",
    });
  } else if (ventes.length) {
    const total = ventes.reduce((s, r) => s + (r.montant ?? 0), 0) || 1;
    const top = Math.max(0, ...sumBy(ventes, (r) => r.client, (r) => r.montant ?? 0).values()) / total;
    const score = clamp(top * 80);
    axes.push({ id: "credit_client", label: "Risque de crédit client", score, level: level(score), drivers: [`Premier client : ${Math.round(top * 100)} % du CA (pas de fichier clients/encours importé).`], strategies: ["Importer le portefeuille clients (encours, retards) pour un calcul complet."], basis: "donnees" });
  } else axes.push({ id: "credit_client", label: "Risque de crédit client", score: 0, level: "faible", drivers: ["Aucune donnée clients ou ventes importée."], strategies: ["Importer un fichier clients (encours, jours de retard)."], basis: "insuffisant" });

  // Opérationnel
  const rh = datasets.filter((d) => d.domain === "rh").flatMap((d) => d.rows);
  const left = rh.filter((r) => r.date_sortie && r.date_sortie <= today(now)).length;
  const turnover = rh.length ? left / rh.length : 0;
  const expByCat = sumBy(finance.history.length ? datasets.filter((d) => d.domain === "finances").flatMap((d) => d.rows).filter((r) => (r.montant ?? 0) < 0) : [], (r) => r.categorie ?? "Non classé", (r) => -(r.montant ?? 0));
  const expTotal = [...expByCat.values()].reduce((s, v) => s + v, 0) || 1;
  const topCat = [...expByCat.entries()].sort((a, b) => b[1] - a[1])[0];
  const critical = anomalies.filter((a) => a.severity === "critique").length;
  const opScore = clamp(turnover * 120 + (topCat ? (topCat[1] / expTotal) * 40 : 0) + critical * 8 + anomalies.length * 1.5);
  axes.push({
    id: "operationnel",
    label: "Risque opérationnel",
    score: opScore,
    level: level(opScore),
    drivers: [
      rh.length ? `Rotation du personnel : ${Math.round(turnover * 100)} % (${left} départ(s) sur ${rh.length} personnes).` : "Aucun registre du personnel importé.",
      topCat ? `Premier poste de dépenses : « ${topCat[0]} » (${Math.round((topCat[1] / expTotal) * 100)} % des dépenses).` : "Aucune dépense importée.",
      `${anomalies.length} anomalie(s) détectée(s) dont ${critical} critique(s).`,
    ],
    strategies: ["Documenter les procédures clés et prévoir des suppléants.", "Contrats fournisseurs avec niveaux de service et pénalités.", "Plan de continuité (pannes, panne réseau, indisponibilité d'un véhicule).", "Traiter les anomalies critiques de l'onglet Données."],
    basis: datasets.length ? (datasets.every((d) => d.isExample) ? "exemple" : "donnees") : "insuffisant",
  });

  // Réglementaire
  const regScore = clamp(100 - compliance.score + input.overdueObligations * 10 + (input.regulatedLegal && input.regulatedLegal.status !== "non_couvert" ? 10 : 0));
  axes.push({
    id: "reglementaire",
    label: "Risque réglementaire",
    score: regScore,
    level: level(regScore),
    drivers: [`Score de conformité : ${compliance.score}/100.`, `${input.overdueObligations} obligation(s) en retard.`, input.regulatedLegal ? `Activité encadrée par le corpus : ${input.regulatedLegal.statusLabel}.` : "Régime sectoriel non évalué."],
    strategies: [...compliance.recommendations.slice(0, 3), "Suivre la veille réglementaire du secteur (onglet Veille & appels d'offres)."],
    basis: "donnees",
    legal: input.regulatedLegal,
  });

  // Liquidité
  const runway = finance.totals.runwayMonths;
  const negative = finance.forecast.find((f) => f.balance < 0);
  const liqScore = !finance.hasData ? 0 : clamp((negative ? 60 : 0) + (runway === null ? 0 : runway < 3 ? 40 : runway < 6 ? 25 : runway < 12 ? 10 : 0) + (finance.currentCash < finance.settings.safetyCash ? 15 : 0));
  axes.push({
    id: "liquidite",
    label: "Risque de liquidité (trésorerie)",
    score: liqScore,
    level: level(liqScore),
    drivers: finance.hasData ? [`Trésorerie estimée : ${new Intl.NumberFormat("fr-FR").format(finance.currentCash)} ${finance.currency}.`, runway === null ? "Flux nets positifs : pas de consommation de trésorerie." : `Autonomie : ${runway} mois.`, negative ? `Solde projeté négatif en ${negative.period}.` : "Pas de rupture projetée sur l'horizon."] : ["Aucun flux financier importé."],
    strategies: ["Accélérer le recouvrement et réduire les délais clients.", "Négocier des délais fournisseurs et étaler les investissements.", "Préparer un dossier de financement (banque, investisseurs) avant d'atteindre le seuil d'alerte."],
    basis: finance.isExample ? "exemple" : finance.hasData ? "donnees" : "insuffisant",
  });

  const weights: Record<RiskAxis["id"], number> = { change: 0.15, credit_client: 0.25, operationnel: 0.2, reglementaire: 0.2, liquidite: 0.2 };
  const overall = clamp(axes.reduce((s, a) => s + a.score * weights[a.id], 0));
  const alerts = axes.filter((a) => a.score >= 55).map((a) => ({ severity: (a.score >= 75 ? "critique" : "attention") as Severity, title: `${a.label} ${a.level === "critique" ? "critique" : "élevé"} (${a.score}/100)`, detail: a.drivers[0] }));
  return { overall, level: level(overall), axes, alerts, isExample: axes.some((a) => a.basis === "exemple") };
}
