import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import {
  createCompany,
  decideApproval,
  draftEmail,
  followUpQuote,
  getSnapshot,
  requestQuotes,
  searchSuppliers,
  simulateQuoteResponse,
  syncObligationReminders,
} from "@/lib/workspace/service";

describe("workspace", () => {
  beforeEach(useTempDb);

  it("seed : 2 entreprises de démo, fournisseurs fictifs en example.com", async () => {
    const snap = await getSnapshot("co_kmerlog");
    expect(snap.companies).toHaveLength(2);
    expect(snap.suppliers.every((s) => s.isExample && s.email.endsWith(".example.com"))).toBe(true);
    expect(snap.mail.mode).toBe("simulation");
  });

  it("un email n'est jamais envoyé sans approbation, puis simulé après validation", async () => {
    const { email, approval } = await draftEmail("co_kmerlog", { to: ["contact@example.com"], subject: "Test", body: "Bonjour" });
    let snap = await getSnapshot("co_kmerlog");
    expect(snap.emails.find((e) => e.id === email.id)?.status).toBe("en_attente_approbation");
    const res = await decideApproval(approval.id, "approuver", "Freddy Choudja");
    expect(res).toMatchObject({ status: "approuvee", emailStatus: "simule" });
    snap = await getSnapshot("co_kmerlog");
    expect(snap.activity.some((a) => a.action === "email.simule")).toBe(true);
    await expect(decideApproval(approval.id, "approuver", "x")).rejects.toThrow(/déjà/);
  });

  it("rejet : l'email est marqué rejeté et le devis annulé", async () => {
    const [created] = await requestQuotes("co_kmerlog", { supplierIds: ["sup_moto1"], need: "10 motos" });
    await decideApproval(created.approvalId, "rejeter", "Freddy");
    const snap = await getSnapshot("co_kmerlog");
    expect(snap.quotes[0].status).toBe("annulee");
    expect(snap.emails[0].status).toBe("rejete");
  });

  it("cycle devis : demande → approbation → relance → réponse simulée", async () => {
    const [created] = await requestQuotes("co_kmerlog", { supplierIds: ["sup_moto1"], need: "10 motos" });
    await expect(simulateQuoteResponse(created.quote.id)).rejects.toThrow();
    await decideApproval(created.approvalId, "approuver", "Freddy");
    const fu = await followUpQuote(created.quote.id);
    expect(fu.quote.followUpCount).toBe(1);
    const q = await simulateQuoteResponse(created.quote.id);
    expect(q.status).toBe("reponse_recue");
    expect(q.response?.simulated).toBe(true);
  });

  it("annuaire : la recherche par besoin trouve les bons fournisseurs", async () => {
    const motos = await searchSuppliers({ need: "motos de livraison" });
    expect(motos[0].id).toMatch(/sup_moto1|sup_logi1/);
    const web = await searchSuppliers({ need: "site web et application mobile" });
    expect(web.map((s) => s.id)).toContain("sup_it1");
    expect(web.map((s) => s.id)).not.toContain("sup_ass1");
  });

  it("nouvelle entreprise : checklist, obligations, propriétaire et rappels idempotents", async () => {
    const co = await createCompany({ name: "Test SA", sector: "Commerce en ligne" });
    const snap = await getSnapshot(co.id);
    expect(snap.checklist.length).toBeGreaterThan(5);
    expect(snap.members[0].role).toBe("proprietaire");
    const first = await syncObligationReminders(co.id, 400);
    const second = await syncObligationReminders(co.id, 400);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toHaveLength(0);
  });

  it("refuse les destinataires invalides", async () => {
    await expect(draftEmail("co_kmerlog", { to: ["pas-un-email"], subject: "x", body: "y" })).rejects.toThrow(/invalide/);
  });
});
