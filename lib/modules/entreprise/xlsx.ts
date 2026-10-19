import type { Table } from "./csv";
import { readZip } from "./zip";

/**
 * Lecteur Excel (.xlsx, Office Open XML) sans dépendance : décompresse l'archive et lit
 * les feuilles (chaînes partagées, chaînes en ligne, nombres, booléens).
 * Les dates Excel (numéros de série) sont converties plus tard, à la structuration.
 */

export function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const texts = (xml: string) => [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decodeXml(m[1])).join("");

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export type Sheet = { name: string } & Table;

export function readXlsx(buf: Buffer, maxRows = 20000): Sheet[] {
  const entries = new Map(readZip(buf).map((e) => [e.name.replace(/^\//, ""), e.data.toString("utf8")]));
  const workbook = entries.get("xl/workbook.xml");
  if (!workbook) throw new Error("Classeur Excel invalide (xl/workbook.xml absent). Seul le format .xlsx est accepté.");
  const rels = entries.get("xl/_rels/workbook.xml.rels") ?? "";
  const relMap = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1] ?? "", m[0].match(/Target="([^"]+)"/)?.[1] ?? ""]));
  const shared = [...(entries.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decodeXml(m[0].match(/name="([^"]*)"/)?.[1] ?? `Feuille ${sheets.length + 1}`);
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1] ?? "";
    let target = relMap.get(rid) ?? `worksheets/sheet${sheets.length + 1}.xml`;
    target = target.replace(/^\/?xl\//, "").replace(/^\//, "");
    const xml = entries.get(`xl/${target}`);
    if (!xml) continue;
    const grid: string[][] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      let next = 0;
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const ref = attrs.match(/r="([A-Z]+\d+)"/i)?.[1];
        const idx = ref ? colIndex(ref) : next;
        next = idx + 1;
        const type = attrs.match(/t="([^"]+)"/)?.[1];
        const body = c[2] ?? "";
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = texts(body);
        else if (type === "b") value = v === "1" ? "VRAI" : "FAUX";
        else if (v !== undefined) value = decodeXml(v);
        while (row.length < idx) row.push("");
        row[idx] = value.trim();
      }
      if (row.some((x) => x !== "")) grid.push(row);
      if (grid.length > maxRows) break;
    }
    const [headers = [], ...rows] = grid;
    sheets.push({ name, headers, rows: rows.map((r) => headers.map((_h, i) => r[i] ?? "")) });
  }
  return sheets;
}
