/** Lecture CSV robuste (séparateur ; , tabulation ou |, guillemets, BOM, fins de ligne Windows). */
export type Table = { headers: string[]; rows: string[][] };

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    let count = 0;
    let quoted = false;
    for (const ch of sample) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string, maxRows = 20000): Table {
  const text = input.replace(/^\uFEFF/, "");
  const d = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > maxRows) break;
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  const [headers = [], ...body] = rows;
  return { headers: headers.map((h) => h.trim()), rows: body.slice(0, maxRows).map((r) => r.map((c) => c.trim())) };
}

/** Sérialise un tableau en CSV (séparateur « ; », usage francophone d'Excel). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}
