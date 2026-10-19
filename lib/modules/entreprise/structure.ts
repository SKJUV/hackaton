import type { Table } from "./csv";
import type { CanonicalField, DataRow, Dataset, DatasetDomain } from "./types";

/** Structuration : reconnaissance des colonnes, du domaine (ventes, finances, RH, clients) et typage des valeurs. */

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const FIELD_PATTERNS: [CanonicalField, RegExp][] = [
  ["date_entree", /^(date (d )?entree|date (d )?embauche|embauche|hire date|entree)$/],
  ["date_sortie", /^(date (de )?sortie|date (de )?depart|depart|fin (de )?contrat|sortie)$/],
  ["echeance", /^(date (d )?echeance|echeance|due date|date limite)$/],
  ["date", /^(date|jour|mois|periode|date (de )?(la )?(facture|operation|vente|transaction|commande|paiement)|month|day|date valeur)$/],
  ["jours_retard", /^(jours? (de )?retard|retard( jours)?|retard paiement|delai (de )?paiement|days late)$/],
  ["encours", /^(encours|encours client|solde (du|client)|creances?|reste a payer|impayes?|montant du|outstanding)$/],
  ["salaire", /^(salaire( brut| mensuel| net)?|remuneration( mensuelle)?|brut mensuel|salary)$/],
  ["quantite", /^(quantite|qte|qty|nombre|nb|volume|unites)$/],
  ["montant", /^(montant( ttc| ht| fcfa| xaf)?|amount|total( ttc| ht)?|ca|chiffre d affaires|valeur|prix total|recette|revenu|somme)$/],
  ["sens", /^(sens|type( d operation| de flux)?|nature|flux|mouvement)$/],
  ["segment", /^(segment|type client|categorie client|typologie)$/],
  ["categorie", /^(categorie|poste budgetaire|rubrique|compte|libelle compte|category|famille|poste de depense|nature de depense)$/],
  ["client", /^(client|customer|nom (du )?client|raison sociale|acheteur|debiteur)$/],
  ["produit", /^(produit|article|designation|item|offre|prestation|service vendu|libelle)$/],
  ["employe", /^(employe|salarie|nom( complet)?|collaborateur|agent|matricule|nom prenom|employee)$/],
  ["departement", /^(departement|service|direction|equipe|pole|department)$/],
  ["poste", /^(poste|fonction|emploi|intitule (du )?poste|job title)$/],
  ["ville", /^(ville|city|localite|region|zone)$/],
  ["devise", /^(devise|currency|monnaie)$/],
];

const DEBIT = /^(debit|sortie|sorties|depense|depenses|decaissement|decaissements)( montant)?$/;
const CREDIT = /^(credit|entree|entrees|recette|recettes|encaissement|encaissements)( montant)?$/;

const NUMERIC_FIELDS = new Set<CanonicalField>(["montant", "quantite", "salaire", "encours", "jours_retard"]);
const DATE_FIELDS = new Set<CanonicalField>(["date", "date_entree", "date_sortie", "echeance"]);

/** Nombre au format français ou anglais : « 1 250 000 », « 1.250.000,50 », « (15 000) », « -15000 FCFA ». */
export function parseNumber(input: string | undefined): number | undefined {
  if (input === undefined) return undefined;
  let s = String(input).trim();
  if (!s) return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s\u00a0\u202f']/g, "").replace(/(fcfa|xaf|cfa|eur|usd|€|\$|f)$/i, "").replace(/^(fcfa|xaf|€|\$)/i, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return undefined;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    s = dec === "." ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (hasDot && /^\d{1,3}(\.\d{3}){2,}$|^\d{1,3}\.\d{3}$/.test(s) && !/^0\./.test(s)) {
    // « 1.250 » est ambigu : on le lit comme un millier (usage comptable francophone).
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = { janv: 1, janvier: 1, jan: 1, fevr: 2, fevrier: 2, fev: 2, feb: 2, mars: 3, mar: 3, avr: 4, avril: 4, apr: 4, mai: 5, may: 5, juin: 6, jun: 6, juil: 7, juillet: 7, jul: 7, aout: 8, aug: 8, sept: 9, septembre: 9, sep: 9, oct: 10, octobre: 10, nov: 11, novembre: 11, dec: 12, decembre: 12 };

const pad = (n: number) => String(n).padStart(2, "0");
function valid(y: number, m: number, d: number) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : undefined;
}

/** Date → AAAA-MM-JJ (ISO, JJ/MM/AAAA, MM/AAAA, « mars 2026 », numéro de série Excel). */
export function parseDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const s = String(input).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], 1);
  m = s.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m) return valid(+m[2], +m[1], 1);
  const t = norm(s);
  m = t.match(/^(?:(\d{1,2}) )?([a-z]+) (\d{4})$/);
  if (m && MONTHS[m[2]]) return valid(+m[3], MONTHS[m[2]], m[1] ? +m[1] : 1);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial > 25000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

export function detectMapping(headers: string[], domain?: DatasetDomain): { mapping: Record<string, CanonicalField>; debit?: string; credit?: string } {
  const mapping: Record<string, CanonicalField> = {};
  const used = new Set<CanonicalField>();
  let debit: string | undefined;
  let credit: string | undefined;
  for (const h of headers) {
    const n = norm(h);
    if (DEBIT.test(n) && !debit) {
      debit = h;
      continue;
    }
    if (CREDIT.test(n) && !credit && n !== "entree") {
      credit = h;
      continue;
    }
    let field = FIELD_PATTERNS.find(([f, re]) => re.test(n) && !used.has(f))?.[0];
    // Ambiguïtés selon le domaine : « service » = produit en ventes, département en RH ; « poste » = catégorie en finances.
    if (field === "departement" && n === "service" && domain === "ventes") field = "produit";
    if (field === "poste" && domain === "finances" && !used.has("categorie")) field = "categorie";
    if (field === "employe" && n.startsWith("nom") && domain && domain !== "rh") field = used.has("client") ? undefined : "client";
    if (field === "categorie" && domain === "clients" && !used.has("segment")) field = "segment";
    // En finances, un « libellé » sert de catégorie s'il n'y a pas de colonne catégorie dédiée.
    if (field === "produit" && domain === "finances" && !used.has("categorie") && !headers.some((x) => /^(categorie|rubrique|compte|poste)/.test(norm(x)))) field = "categorie";
    if (field) {
      mapping[h] = field;
      used.add(field);
    }
  }
  return { mapping, debit, credit };
}

export function detectDomain(headers: string[], fileName = ""): DatasetDomain {
  const { mapping, debit, credit } = detectMapping(headers);
  const fields = new Set(Object.values(mapping));
  const score: Record<DatasetDomain, number> = { ventes: 0, finances: 0, rh: 0, clients: 0 };
  const add = (d: DatasetDomain, f: CanonicalField, pts: number) => {
    if (fields.has(f)) score[d] += pts;
  };
  for (const f of ["salaire", "departement", "poste", "date_entree", "date_sortie"] as const) add("rh", f, 3);
  add("rh", "employe", 2);
  for (const f of ["encours", "jours_retard", "segment", "echeance"] as const) add("clients", f, 3);
  add("clients", "client", 1);
  for (const f of ["produit", "quantite"] as const) add("ventes", f, 3);
  add("ventes", "client", 2);
  add("ventes", "montant", 1);
  for (const f of ["sens", "categorie"] as const) add("finances", f, 3);
  add("finances", "montant", 1);
  if (debit || credit) score.finances += 5;
  const n = norm(fileName);
  if (/vente|sales|factur|commande/.test(n)) score.ventes += 4;
  if (/financ|tresor|banque|compta|depense|budget|journal|releve/.test(n)) score.finances += 4;
  if (/\brh\b|paie|salari|personnel|effectif|employ/.test(n)) score.rh += 4;
  if (/client|creance|recouvr|customer/.test(n)) score.clients += 4;
  return (Object.entries(score) as [DatasetDomain, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

const EXPENSE = /(depense|sortie|debit|charge|achat|decaiss|paiement fournisseur|salaire|loyer|^-$)/;
const INCOME = /(recette|entree|credit|produit|vente|encaiss|revenu|^\+$)/;

export function structureTable(
  table: Table,
  opts: { companyId: string; id: string; name: string; fileName: string; kind: Dataset["source"]["kind"]; sheet?: string; domain?: DatasetDomain; isExample?: boolean; now?: string },
): Dataset {
  const domain = opts.domain ?? detectDomain(table.headers, opts.fileName);
  const { mapping, debit, credit } = detectMapping(table.headers, domain);
  const warnings: string[] = [];
  if (debit || credit) warnings.push(`Colonnes ${[credit, debit].filter(Boolean).join(" / ")} combinées en un montant signé (recettes positives, dépenses négatives).`);
  const rows: DataRow[] = [];
  let badNumbers = 0;
  let badDates = 0;
  for (const cells of table.rows) {
    const raw: Record<string, string> = {};
    table.headers.forEach((h, i) => (raw[h || `colonne_${i + 1}`] = cells[i] ?? ""));
    const row: DataRow = { raw };
    for (const [col, field] of Object.entries(mapping)) {
      const v = raw[col];
      if (v === undefined || v === "") continue;
      if (NUMERIC_FIELDS.has(field)) {
        const n = parseNumber(v);
        if (n === undefined) badNumbers++;
        else (row as Record<string, unknown>)[field] = n;
      } else if (DATE_FIELDS.has(field)) {
        const d = parseDate(v);
        if (!d) badDates++;
        else (row as Record<string, unknown>)[field] = d;
      } else if (field !== "sens") (row as Record<string, unknown>)[field] = v;
    }
    if (debit || credit) {
      const c = parseNumber(credit ? raw[credit] : undefined) ?? 0;
      const d = parseNumber(debit ? raw[debit] : undefined) ?? 0;
      if (c || d) row.montant = Math.abs(c) - Math.abs(d);
    }
    const sensCol = Object.entries(mapping).find(([, f]) => f === "sens")?.[0];
    if (sensCol && row.montant !== undefined) {
      const sv = norm(raw[sensCol] ?? "");
      if (EXPENSE.test(sv)) row.montant = -Math.abs(row.montant);
      else if (INCOME.test(sv)) row.montant = Math.abs(row.montant);
    }
    rows.push(row);
  }
  if (badNumbers) warnings.push(`${badNumbers} valeur(s) numérique(s) illisible(s) ignorée(s).`);
  if (badDates) warnings.push(`${badDates} date(s) illisible(s) ignorée(s).`);
  const missing: Record<DatasetDomain, CanonicalField[]> = { ventes: ["date", "montant"], finances: ["date", "montant"], rh: ["employe", "salaire"], clients: ["client"] };
  const mapped = new Set<string>(Object.values(mapping));
  if (debit || credit) mapped.add("montant");
  for (const f of missing[domain]) if (!mapped.has(f)) warnings.push(`Colonne « ${f} » non reconnue : renommez l'en-tête correspondant pour un tableau de bord complet.`);
  return {
    id: opts.id,
    companyId: opts.companyId,
    name: opts.name,
    domain,
    source: { kind: opts.kind, fileName: opts.fileName, sheet: opts.sheet },
    mapping,
    headers: table.headers,
    rows,
    warnings,
    importedAt: opts.now ?? new Date().toISOString(),
    isExample: Boolean(opts.isExample),
  };
}
