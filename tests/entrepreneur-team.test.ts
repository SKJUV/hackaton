import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { extractPdfText } from "@/lib/modules/entrepreneur/cv";
import { labourLaw } from "@/lib/modules/entrepreneur/grounding";
import { anonymize, biasAlerts, extractYears, scoreCandidate } from "@/lib/modules/entrepreneur/scoring";
import { readModule } from "@/lib/modules/entrepreneur/store";
import { createJob, decideCandidate, importCandidate, recruitmentCompliance, reviewCandidate, screenCandidates, setMemberSkills, teamGaps } from "@/lib/modules/entrepreneur/team";
import type { Ctx, JobOpening } from "@/lib/modules/entrepreneur/types";
import { addMember, createCompany } from "@/lib/workspace/service";
import { resetDemoData } from "@/lib/workspace/store";

const ctx = (companyId = "co_kmerlog"): Ctx => ({ companyId, citations: [], groundings: [] });
const JOB: Pick<JobOpening, "criteria" | "minYears" | "threshold"> = {
  minYears: 3,
  threshold: 60,
  criteria: [
    { label: "Mobile", keywords: ["android", "flutter", "mobile"], weight: 30, required: true },
    { label: "Back-end", keywords: ["node", "api"], weight: 20, required: false },
  ],
};

/** PDF minimal (une page, police standard) pour tester l'extraction réelle. */
function tinyPdf(text: string) {
  const stream = `BT /F1 12 Tf 50 750 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}

const hasPdftotext = (() => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("recrutement — score objectif et aveugle", () => {
  it("le nom et l'email n'influencent pas le score", () => {
    const cv = "Agent commercial, 2 ans d'expérience.";
    const a = scoreCandidate(JOB, cv, "Android Flutter", "node.api@x.com");
    const b = scoreCandidate(JOB, cv, "Marie T.", "marie@x.com");
    expect(a.score).toBe(b.score);
    expect(a.breakdown.filter((x) => x.label !== "Expérience ≥ 3 an(s)").every((x) => x.points === 0)).toBe(true);
    expect(anonymize("Jean Node, jean@x.com, +237 6 99 99 99 99", "Jean Node", "jean@x.com")).not.toMatch(/Node|jean@|99 99/);
  });
  it("critère obligatoire manquant → sous le seuil ; seuil respecté sinon", () => {
    const strong = scoreCandidate(JOB, "Développeur Android et Flutter, API Node, 5 ans d'expérience.", "X");
    expect(strong.status).toBe("retenu");
    const noMobile = scoreCandidate(JOB, "Développeur API Node, 8 ans d'expérience.", "Y");
    expect(noMobile.missingRequired).toEqual(["Mobile"]);
    expect(noMobile.status).toBe("sous_seuil");
    expect(extractYears("Plus de 6 ans d'expérience en développement")).toBe(6);
    expect(extractYears("Né il y a 30 ans")).toBeNull();
  });
});

describe("recrutement — module", () => {
  beforeEach(useTempDb);

  it("compétences manquantes et profils (données d'exemple de la démo)", async () => {
    const g = await teamGaps("co_kmerlog");
    expect(g.gaps.map((x) => x.domain)).toContain("tech");
    expect(g.profiles.find((p) => p.domain === "tech")?.kind).toBe("cofondateur");
    await setMemberSkills("co_kmerlog", "mem_paul", ["développement mobile Flutter"]);
    expect((await teamGaps("co_kmerlog")).gaps.map((x) => x.domain)).not.toContain("tech");
  });

  it("alerte de biais affinitaire et conflit d'intérêts sur le jeu d'exemple", async () => {
    const { m, data } = await readModule("co_kmerlog");
    const job = m.jobs[0];
    const alerts = biasAlerts(job, m.candidates, m.reviews, data.members);
    expect(alerts.some((a) => a.level === "alerte" && /ami/.test(a.message))).toBe(true);
    expect(alerts.some((a) => /Conflit d'intérêts/.test(a.message))).toBe(true);
    const s = await screenCandidates("co_kmerlog", job.id);
    expect(s.retenus[0].name).toMatch(/Brice/);
    expect(s.sous_seuil.length).toBeGreaterThan(0);
  });

  it("fiche de poste : droit du travail « non couvert » si absent du corpus, document à valider", async () => {
    const r = await createJob("co_kmerlog", { title: "Responsable des opérations", domain: "operations" }, ctx(), "utilisateur");
    expect(r.job.criteria.length).toBeGreaterThan(0);
    const travail = await labourLaw(ctx(), "période d'essai");
    if (travail.statut === "non_couvert") {
      expect(r.conformite.droit_du_travail.libelle).toMatch(/non couvert/);
      expect(travail.sources).toEqual([]);
    }
    const c = await recruitmentCompliance(ctx());
    expect(c.bonnes_pratiques.length).toBeGreaterThan(2);
  });

  it("import, forçage justifié (signalé), avis collaboratif : en vrai, on n'évalue qu'en son nom", async () => {
    const co = await createCompany({ name: "Réelle SARL", sector: "Application mobile de livraison", ownerName: "Ada", ownerEmail: "ada@real.example.com" });
    await addMember(co.id, { name: "Bob", email: "bob@real.example.com", role: "membre" });
    const { data } = await readModule(co.id);
    const [ada, bob] = data.members.filter((x) => x.companyId === co.id);
    const { job } = await createJob(co.id, { title: "CTO", domain: "tech", kind: "cofondateur" }, ctx(co.id));
    const friend = await importCandidate(co.id, { jobId: job.id, name: "Ami Proche", cvText: "Gestion de boutique et réseaux sociaux pendant 3 ans.", relation: "ami", referredBy: ada.id });
    expect(friend.status).toBe("sous_seuil");
    await expect(decideCandidate(co.id, { candidateId: friend.id, override: true })).rejects.toThrow(/Justifiez/);
    await decideCandidate(co.id, { candidateId: friend.id, override: true, reason: "Connaît le terrain" });
    await expect(reviewCandidate(co.id, { candidateId: friend.id, memberId: bob.id, rating: 4 }, "ada@real.example.com")).rejects.toThrow(/en votre nom/);
    const r = await reviewCandidate(co.id, { candidateId: friend.id, memberId: ada.id, rating: 5 }, "ada@real.example.com");
    expect(r.alerte).toMatch(/Conflit/);
    const s = await screenCandidates(co.id, job.id);
    expect(s.alertes_biais.some((a) => a.level === "alerte")).toBe(true);
  });

  it("« Réinitialiser la démo » ré-applique le seed du module et conserve les vraies entreprises", async () => {
    const co = await createCompany({ name: "Vraie SAS", sector: "Agritech", ownerName: "Ada", ownerEmail: "ada@vraie.example.com" });
    const { job } = await createJob(co.id, { title: "Agronome", domain: "operations" }, ctx(co.id));
    await importCandidate("co_kmerlog", { jobId: "job_co_kmerlog_cto", name: "Démo Ajout", cvText: "Développeuse Flutter et Android, 4 ans d expérience." });
    await resetDemoData();
    const { m } = await readModule("co_kmerlog");
    expect(m.candidates.some((c) => c.name === "Démo Ajout")).toBe(false);
    expect(m.candidates.filter((c) => c.companyId === "co_kmerlog").length).toBe(4);
    expect(m.jobs.some((j) => j.id === job.id)).toBe(true);
  });

  it.skipIf(!hasPdftotext)("extraction réelle d'un CV PDF (pdftotext)", async () => {
    const text = await extractPdfText(tinyPdf("Developpeur Android Flutter 5 ans d experience"));
    expect(text).toContain("Android");
    await expect(extractPdfText(new TextEncoder().encode("pas un pdf"))).rejects.toThrow(/PDF/);
  });
});
