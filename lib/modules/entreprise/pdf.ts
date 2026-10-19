/**
 * Générateur PDF minimal sans dépendance (texte, titres, pagination A4, Helvetica WinAnsi).
 * Suffisant pour des rapports exportables (investisseurs, banque, fisc, data room).
 */

const WIN_ANSI: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "œ": 0x9c, "Œ": 0x8c, "™": 0x99 };

function encode(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    let code = ch.codePointAt(0)!;
    if (WIN_ANSI[ch]) code = WIN_ANSI[ch];
    else if (code > 255) {
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      code = base.length === 1 && base.charCodeAt(0) < 256 ? base.charCodeAt(0) : 63; // « ? » pour les caractères hors WinAnsi
    }
    if (code === 40 || code === 41 || code === 92) out += "\\" + String.fromCharCode(code);
    else if (code < 32 || code > 126) out += "\\" + code.toString(8).padStart(3, "0");
    else out += String.fromCharCode(code);
  }
  return out;
}

function wrap(text: string, size: number, width: number): string[] {
  const maxChars = Math.max(10, Math.floor(width / (size * 0.5)));
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if ((line + " " + word).trim().length > maxChars) {
        if (line) lines.push(line);
        line = word.length > maxChars ? word.slice(0, maxChars) : word;
      } else line = (line + " " + word).trim();
    }
    lines.push(line);
  }
  return lines;
}

/** Convertit un Markdown simple (titres, listes, tableaux, paragraphes) en PDF. */
export function markdownToPdf(markdown: string, title: string, footer = "Co-founder"): Buffer {
  type Line = { text: string; size: number; bold: boolean; gap: number };
  const items: Line[] = [{ text: title, size: 16, bold: true, gap: 10 }];
  for (const raw of markdown.split("\n")) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").trimEnd();
    if (!line.trim()) {
      items.push({ text: "", size: 6, bold: false, gap: 0 });
      continue;
    }
    if (/^\|\s*:?-{2,}/.test(line.trim())) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      items.push({ text: h[2], size: h[1].length <= 1 ? 14 : h[1].length === 2 ? 12.5 : 11, bold: true, gap: 6 });
      continue;
    }
    if (/^\|.*\|$/.test(line.trim())) {
      items.push({ text: line.trim().slice(1, -1).split("|").map((c) => c.trim()).join("  |  "), size: 8.5, bold: false, gap: 0 });
      continue;
    }
    const text = line.replace(/^\s*[-*]\s+/, "• ").replace(/^>\s?/, "» ");
    items.push({ text, size: 10, bold: false, gap: 0 });
  }

  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 50;
  const pages: string[] = [];
  let ops: string[] = [];
  let y = pageH - margin;
  const flush = () => {
    pages.push(ops.join("\n"));
    ops = [];
    y = pageH - margin;
  };
  for (const it of items) {
    const parts = it.text ? wrap(it.text, it.size, pageW - 2 * margin) : [""];
    y -= it.gap;
    for (const part of parts) {
      const lh = it.size * 1.35;
      if (y - lh < margin + 20) flush();
      y -= lh;
      if (part) ops.push(`BT /${it.bold ? "F2" : "F1"} ${it.size} Tf ${margin} ${y.toFixed(2)} Td (${encode(part)}) Tj ET`);
    }
  }
  flush();

  const objects: string[] = [];
  const add = (s: string) => objects.push(s) - 1 + 1; // numéro d'objet (1-indexé)
  const catalog = add("");
  const pagesObj = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((content, i) => {
    const foot = `BT /F1 8 Tf ${margin} 30 Td (${encode(`${footer} — page ${i + 1}/${pages.length}`)}) Tj ET`;
    const stream = `${content}\n${foot}`;
    const len = Buffer.byteLength(stream, "latin1");
    const c = add(`<< /Length ${len} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
