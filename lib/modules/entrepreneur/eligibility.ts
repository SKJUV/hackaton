/** Matching d'éligibilité — PUR et explicable : chaque critère renvoie ok / ko / à vérifier avec sa raison. */
import type { Company } from "@/lib/workspace/types";
import type { Criterion, FundingProgram } from "./programs";
import type { EntrepreneurProfile, Tri } from "./types";
import { hasKeyword, norm } from "./util";

export const AFRICAN_COUNTRIES = [
  "Afrique du Sud", "Algérie", "Angola", "Bénin", "Botswana", "Burkina Faso", "Burundi", "Cabo Verde", "Cameroun", "République centrafricaine", "Comores", "Congo",
  "RD Congo", "Côte d'Ivoire", "Djibouti", "Égypte", "Érythrée", "Eswatini", "Éthiopie", "Gabon", "Gambie", "Ghana", "Guinée", "Guinée-Bissau", "Guinée équatoriale",
  "Kenya", "Lesotho", "Liberia", "Libye", "Madagascar", "Malawi", "Mali", "Maroc", "Maurice", "Mauritanie", "Mozambique", "Namibie", "Niger", "Nigeria", "Ouganda",
  "Rwanda", "Sao Tomé-et-Principe", "Sénégal", "Seychelles", "Sierra Leone", "Somalie", "Soudan", "Soudan du Sud", "Tanzanie", "Tchad", "Togo", "Tunisie", "Zambie", "Zimbabwe",
];

export type CriterionResult = { label: string; status: Tri; detail: string; confidence: Criterion["confidence"] };
export type Eligibility = {
  programId: string;
  verdict: "eligible" | "non_eligible" | "a_verifier";
  score: number;
  results: CriterionResult[];
  window: string;
};

const DIGITAL = ["application", "plateforme", "logiciel", "numerique", "en ligne", "internet", "mobile", "commerce electronique", "digital", "saas", "tic", "site web", "suivi en temps reel"];

export function yearsOperating(company: Company, profile?: EntrepreneurProfile): number | null {
  if (typeof profile?.yearsOperating === "number") return profile.yearsOperating;
  if (company.stage === "idee") return 0;
  return null;
}

function projectText(company: Company) {
  return `${company.sector} ${company.sectorKeywords.join(" ")} ${company.description}`;
}

export function evaluateCriterion(c: Criterion, company: Company, profile?: EntrepreneurProfile): CriterionResult {
  const base = { label: c.label, confidence: c.confidence };
  const soft = (detail: string): CriterionResult => ({ ...base, status: c.confidence === "secondaire" ? "a_verifier" : "ko", detail: c.confidence === "secondaire" ? `${detail} (critère issu d'une source secondaire : à confirmer)` : detail });
  const unknown = (detail: string): CriterionResult => ({ ...base, status: "a_verifier", detail });
  const ok = (detail: string): CriterionResult => ({ ...base, status: "ok", detail });
  const years = yearsOperating(company, profile);
  switch (c.kind) {
    case "pays": {
      const list = (c.value as string[]) ?? [];
      const country = company.country || "Cameroun";
      const inList = list.includes("Afrique") ? AFRICAN_COUNTRIES.some((x) => norm(x) === norm(country)) : list.some((x) => norm(x) === norm(country));
      return inList ? ok(`${country} fait partie de la zone couverte.`) : soft(`${country} ne figure pas dans la zone couverte.`);
    }
    case "age_min": {
      const min = Number(c.value);
      if (typeof profile?.founderAge !== "number") return unknown(`Âge du fondateur non renseigné (minimum ${min} ans).`);
      return profile.founderAge >= min ? ok(`${profile.founderAge} ans ≥ ${min}.`) : soft(`${profile.founderAge} ans < ${min}.`);
    }
    case "anciennete_max": {
      const max = Number(c.value);
      if (years === null) return unknown(`Ancienneté de l'entreprise non renseignée (maximum ${max} an(s)).`);
      return years <= max ? ok(`${years} an(s) d'activité ≤ ${max}.`) : soft(`${years} an(s) d'activité > ${max}.`);
    }
    case "anciennete_min": {
      const min = Number(c.value);
      if (years === null) return unknown(`Ancienneté non renseignée (minimum ${min} ans).`);
      return years >= min ? ok(`${years} an(s) ≥ ${min}.`) : soft(`${years} an(s) d'activité < ${min} requis.`);
    }
    case "numerique": {
      if (profile?.isDigital === true) return ok("Produit numérique déclaré.");
      if (profile?.isDigital === false) return soft("Projet déclaré non numérique.");
      return DIGITAL.some((k) => hasKeyword(projectText(company), k)) ? ok("Composante numérique déduite de la description (à confirmer dans le profil).") : unknown("Composante numérique non établie : précisez-la dans le profil.");
    }
    case "prototype":
      return profile?.hasPrototype === true ? ok("Prototype / MVP déclaré.") : profile?.hasPrototype === false ? soft("Pas encore de prototype.") : unknown("Existence d'un prototype non renseignée.");
    case "immatriculee":
      return profile?.isRegistered === true ? ok("Entreprise immatriculée.") : profile?.isRegistered === false ? soft("Entreprise non encore immatriculée.") : unknown("Immatriculation non renseignée.");
    case "chiffre_affaires":
      return profile?.hasRevenue === true ? ok("Revenus déclarés.") : profile?.hasRevenue === false ? soft("Pas encore de revenus.") : unknown("Revenus non renseignés.");
    case "levee_max_usd": {
      const max = Number(c.value);
      if (typeof profile?.fundingRaisedUsd !== "number") return unknown("Montant levé non renseigné.");
      return profile.fundingRaisedUsd <= max ? ok(`Levée cumulée ${profile.fundingRaisedUsd} USD ≤ ${max}.`) : soft(`Levée cumulée ${profile.fundingRaisedUsd} USD > ${max}.`);
    }
    case "equipe_min": {
      const min = Number(c.value);
      if (typeof profile?.teamSize !== "number") return unknown(`Taille de l'équipe fondatrice non renseignée (minimum ${min}).`);
      return profile.teamSize >= min ? ok(`${profile.teamSize} fondateur(s) ≥ ${min}.`) : soft(`${profile.teamSize} fondateur(s) < ${min}.`);
    }
    case "secteur_exclu": {
      const hit = ((c.value as string[]) ?? []).filter((k) => hasKeyword(projectText(company), k));
      return hit.length ? soft(`Activité exclue détectée : ${hit.join(", ")}.`) : ok("Aucune activité exclue détectée.");
    }
    case "secteur_requis": {
      const hit = ((c.value as string[]) ?? []).filter((k) => hasKeyword(projectText(company), k));
      return hit.length ? ok(`Secteur compatible (${hit.join(", ")}).`) : soft("Secteur hors du périmètre du programme.");
    }
    case "manuel":
    default:
      return unknown("À vérifier par l'entrepreneur sur la page officielle.");
  }
}

export function evaluateProgram(program: FundingProgram, company: Company, profile?: EntrepreneurProfile): Eligibility {
  const results = program.criteria.map((c) => evaluateCriterion(c, company, profile));
  const ko = results.some((r) => r.status === "ko");
  const okCount = results.filter((r) => r.status === "ok").length;
  const verdict = ko ? "non_eligible" : results.every((r) => r.status === "ok") ? "eligible" : "a_verifier";
  const window = program.cycle === "continu" ? "Candidatures en continu (vérifier la page officielle)." : `${program.lastKnownWindow ?? "Cycle annuel."} Surveillez la prochaine édition.`;
  return { programId: program.id, verdict, score: Math.round((100 * okCount) / Math.max(1, results.length)), results, window };
}
