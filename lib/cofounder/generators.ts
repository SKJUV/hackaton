import type { Company, Member } from "@/lib/workspace/types";

/**
 * Générateurs « co-fondateur » déterministes à partir du profil entreprise.
 * Quand un LLM est configuré, l'agent peut fournir son propre contenu ; sinon ces modèles servent de base.
 * Les modèles juridiques sont des TRAMES à faire valider par un professionnel.
 */

const money = (n: number | undefined, currency: string) =>
  n === undefined ? "à définir" : `${new Intl.NumberFormat("fr-FR").format(n)} ${currency}`;

export function generateBusinessPlan(company: Company, notes = ""): string {
  return `# Business plan — ${company.name}

> Généré par le co-fondateur IA à partir du profil entreprise. Les chiffres sont des hypothèses de travail à valider.

## 1. Résumé
${company.description}

- **Secteur** : ${company.sector}
- **Forme juridique envisagée** : ${company.legalForm}
- **Localisation** : ${company.city}, ${company.country}
- **Capital** : ${money(company.capital, company.currency)}
- **Stade** : ${company.stage}

## 2. Problème et opportunité
- Quel problème concret résolvez-vous, pour qui, et à quelle fréquence ?
- Pourquoi maintenant (adoption du mobile money, croissance du e-commerce, régulation…) ?

## 3. Proposition de valeur
- Offre principale et différenciation
- Preuves : premiers clients, lettres d'intention, pilote

## 4. Marché
| Niveau | Hypothèse | Source à documenter |
|---|---|---|
| Marché total | à estimer | études sectorielles, rapports de l'autorité de régulation (voir corpus) |
| Marché adressable | ${company.city} et villes proches | enquête terrain |
| Objectif 12 mois | 1–3 % du marché adressable | pipeline commercial |

## 5. Modèle économique
- Sources de revenus, prix unitaire, marge brute cible
- Coûts fixes mensuels (personnel, locaux, outils) et coûts variables

## 6. Plan opérationnel
- Fournisseurs clés (voir onglet Fournisseurs & devis)
- Recrutements des 6 premiers mois
- Autorisations sectorielles : voir checklist de création et réponses de l'assistant juridique (sources officielles citées)

## 7. Plan financier (hypothèses)
| Poste | Mois 1–3 | Mois 4–6 | Mois 7–12 |
|---|---|---|---|
| Chiffre d'affaires | — | — | — |
| Charges | — | — | — |
| Trésorerie fin de période | — | — | — |

## 8. Risques et conformité
- Risques réglementaires : suivre le score de conformité et le calendrier des obligations
- Risques opérationnels et parades

## 9. Besoin de financement
- Montant, usage des fonds, jalons financés
${notes ? `\n## Notes du fondateur\n${notes}\n` : ""}`;
}

export function generateRoadmap(company: Company, months = 6): string {
  const phases = [
    { name: "Fondations", items: ["Finaliser statuts et immatriculation", "Ouvrir le compte bancaire pro", "Vérifier le régime sectoriel avec l'assistant juridique"] },
    { name: "Produit minimum", items: ["Définir l'offre pilote", "Sélectionner les fournisseurs (3 devis par poste)", "Lancer un pilote avec 5–10 clients"] },
    { name: "Lancement commercial", items: ["Campagne de lancement", "Mettre en place le suivi des obligations fiscales et sociales", "Premiers recrutements"] },
    { name: "Croissance", items: ["Mesurer les indicateurs clés (CAC, rétention, marge)", "Préparer la levée de fonds", "Étendre à une nouvelle ville"] },
  ];
  const perPhase = Math.max(1, Math.round(months / phases.length));
  let cursor = 1;
  const rows = phases.map((phase) => {
    const start = cursor;
    const end = Math.min(months, cursor + perPhase - 1);
    cursor = end + 1;
    return `### Mois ${start}${end > start ? `–${end}` : ""} · ${phase.name}\n${phase.items.map((i) => `- [ ] ${i}`).join("\n")}`;
  });
  return `# Roadmap ${months} mois — ${company.name}\n\nSecteur : ${company.sector} · Stade actuel : ${company.stage}\n\n${rows.join("\n\n")}\n`;
}

export type LegalTemplateKind = "statuts" | "contrat_prestation" | "nda" | "contrat_travail" | "pv_ag";

export const LEGAL_TEMPLATE_LABELS: Record<LegalTemplateKind, string> = {
  statuts: "Statuts",
  contrat_prestation: "Contrat de prestation de services",
  nda: "Accord de confidentialité (NDA)",
  contrat_travail: "Contrat de travail",
  pv_ag: "Procès-verbal d'assemblée générale",
};

const disclaimer =
  "> ⚠️ Trame générée automatiquement à partir du profil de l'entreprise. Elle ne cite aucun texte de loi et doit être relue et validée par un professionnel du droit avant signature. Les références légales applicables doivent être tirées du corpus officiel.";

export function generateLegalDocument(
  kind: LegalTemplateKind,
  company: Company,
  members: Member[],
  details: Record<string, string> = {},
): string {
  const associates = members.filter((m) => m.role === "proprietaire" || m.role === "admin");
  const partyB = details.partie || details.cocontractant || "[Nom du cocontractant]";
  switch (kind) {
    case "statuts":
      return `# Statuts de ${company.name.replace(" (démo)", "")} — ${company.legalForm}\n\n${disclaimer}\n\n## Titre I — Forme, objet, dénomination, siège, durée\n**Article 1 — Forme.** Il est formé entre les soussignés une société de forme ${company.legalForm}.\n\n**Article 2 — Objet.** La société a pour objet : ${company.sector.toLowerCase()} ; ${company.description}\n\n**Article 3 — Dénomination.** ${company.name.replace(" (démo)", "")}\n\n**Article 4 — Siège social.** ${company.city}, ${company.country}.\n\n**Article 5 — Durée.** [à compléter] années à compter de l'immatriculation.\n\n## Titre II — Apports, capital social\n**Article 6 — Capital.** Le capital social est fixé à ${money(company.capital, company.currency)}.\n\n**Article 7 — Répartition.**\n${associates.map((a) => `- ${a.name} : [nombre] parts / actions`).join("\n") || "- [Associés à compléter]"}\n\n## Titre III — Gérance / Direction\n**Article 8 — Dirigeant(s).** [Nom, pouvoirs, durée du mandat]\n\n## Titre IV — Décisions collectives, exercice social, comptes\n**Article 9 — Assemblées.** [Règles de quorum et de majorité à compléter]\n\n**Article 10 — Exercice social.** Du 1er janvier au 31 décembre.\n\nFait à ${company.city}, le [date].\n`;
    case "contrat_prestation":
      return `# Contrat de prestation de services\n\n${disclaimer}\n\n**Entre** ${company.name.replace(" (démo)", "")}, ${company.legalForm}, ${company.city} (« le Client »)\n**Et** ${partyB} (« le Prestataire »)\n\n1. **Objet** : ${details.objet || "[description de la prestation]"}\n2. **Prix** : ${details.prix || "[montant]"} ${company.currency}, payable [modalités]\n3. **Délais** : ${details.delai || "[délai]"}\n4. **Obligations du Prestataire** : qualité, confidentialité, respect des délais\n5. **Obligations du Client** : collaboration, paiement\n6. **Responsabilité et assurances**\n7. **Résiliation** : préavis de [x] jours\n8. **Litiges** : règlement amiable préalable, puis juridiction compétente de ${company.city}\n\nFait en deux exemplaires à ${company.city}, le [date].\n`;
    case "nda":
      return `# Accord de confidentialité\n\n${disclaimer}\n\nEntre ${company.name.replace(" (démo)", "")} et ${partyB}.\n\n1. **Informations confidentielles** : toute information technique, commerciale ou financière échangée dans le cadre de ${details.objet || "[projet]"}.\n2. **Obligations** : ne pas divulguer, n'utiliser qu'aux fins du projet, protéger avec un soin raisonnable.\n3. **Exclusions** : informations publiques ou déjà connues.\n4. **Durée** : ${details.duree || "[x] ans"}.\n5. **Restitution** des documents à la fin des discussions.\n`;
    case "contrat_travail":
      return `# Contrat de travail\n\n${disclaimer}\n\nEmployeur : ${company.name.replace(" (démo)", "")}, ${company.city}\nSalarié : ${partyB}\n\n- **Poste** : ${details.poste || "[intitulé]"}\n- **Date d'embauche** : [date] · **Période d'essai** : [durée conforme aux textes officiels]\n- **Rémunération** : ${details.salaire || "[montant]"} ${company.currency} brut mensuel\n- **Durée du travail** : [selon les textes officiels]\n- **Lieu** : ${company.city}\n- **Congés, protection sociale** : selon les textes officiels applicables\n`;
    case "pv_ag":
      return `# Procès-verbal d'assemblée générale\n\n${disclaimer}\n\nSociété : ${company.name.replace(" (démo)", "")} · ${company.legalForm} · capital ${money(company.capital, company.currency)}\n\nLe [date], à ${company.city}, les associés se sont réunis.\n\n**Présents** : ${associates.map((a) => a.name).join(", ") || "[à compléter]"}\n\n**Ordre du jour** : ${details.ordre_du_jour || "approbation des comptes de l'exercice ; affectation du résultat"}\n\n**Résolutions** : [à compléter]\n`;
  }
}
