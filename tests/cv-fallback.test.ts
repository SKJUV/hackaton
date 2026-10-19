import { afterEach, describe, expect, it } from "vitest";
import { extractPdfText, extractWithJs } from "@/lib/modules/entrepreneur/cv";

/** PDF minimal généré à la volée (aucun fichier binaire versionné). */
function tinyPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
const CV = "Curriculum vitae exemple - developpeuse fullstack - 5 ans d experience TypeScript";

describe("CV PDF : repli JavaScript sans pdftotext (Vercel)", () => {
  afterEach(() => { delete process.env.CV_PDF_EXTRACTOR; });
  it("extrait le texte avec unpdf", async () => {
    const text = await extractWithJs(tinyPdf(CV));
    expect(text).toContain("Curriculum vitae exemple");
  });
  it("extractPdfText bascule sur le repli JS quand pdftotext est indisponible", async () => {
    process.env.CV_PDF_EXTRACTOR = "js";
    expect((await extractPdfText(tinyPdf(CV)))).toContain("TypeScript");
  });
});
