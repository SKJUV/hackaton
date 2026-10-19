import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { TOOL_MAP } from "@/lib/agent/tools";
import { assertApprover, assertCompanyAccess, assertObjectAccess, type Viewer } from "@/lib/workspace/access";
import { createCompany, createTask, draftEmail, getSnapshot } from "@/lib/workspace/service";
import { readData, resetDemoData } from "@/lib/workspace/store";

const alice: Viewer = { user: null, email: "alice@demo.example.com" };
const bob: Viewer = { user: null, email: "bob@demo.example.com" };

async function aliceCompany() {
  const company = await createCompany({ name: "Alice SARL", sector: "Services", ownerName: "Alice", ownerEmail: alice.email! });
  return company;
}

describe("contrôle d'appartenance", () => {
  beforeEach(useTempDb);

  it("un non-membre ne voit ni n'agit sur l'entreprise d'un autre", async () => {
    const c = await aliceCompany();
    await expect(assertCompanyAccess(c.id, alice)).resolves.toBeTruthy();
    await expect(assertCompanyAccess(c.id, bob)).rejects.toMatchObject({ status: 404 });
    const task = await createTask(c.id, { title: "Secret" });
    await expect(assertObjectAccess("tasks", task.id, alice)).resolves.toBe(c.id);
    await expect(assertObjectAccess("tasks", task.id, bob)).rejects.toMatchObject({ status: 404 });
    await expect(assertObjectAccess("tasks", "inexistant", alice)).rejects.toMatchObject({ status: 404 });
  });

  it("les entreprises de démonstration restent partagées", async () => {
    await expect(assertCompanyAccess("co_kmerlog", bob)).resolves.toBeTruthy();
    await expect(assertCompanyAccess("co_kmerlog", { user: null, email: null })).resolves.toBeTruthy();
  });

  it("approbation : membre de la même entreprise, et en son propre nom pour une vraie entreprise", async () => {
    const c = await aliceCompany();
    const { approval } = await draftEmail(c.id, { to: ["x@demo.example.com"], subject: "Test", body: "Bonjour" });
    const data = await readData();
    const owner = data.members.find((m) => m.companyId === c.id)!;
    const demoMember = data.members.find((m) => m.companyId === "co_kmerlog")!;
    await expect(assertApprover(approval.id, owner.id, alice)).resolves.toMatchObject({ id: owner.id });
    await expect(assertApprover(approval.id, demoMember.id, alice)).rejects.toMatchObject({ status: 403 });
    await expect(assertApprover(approval.id, owner.id, bob)).rejects.toMatchObject({ status: 404 });
  });

  it("l'agent ne peut pas toucher un objet d'une autre entreprise", async () => {
    const c = await aliceCompany();
    const step = (await readData()).checklist.find((s) => s.companyId === c.id)!;
    await expect(TOOL_MAP.get("mettre_a_jour_demarche")!.run({ demarche_id: step.id, statut: "fait" }, { companyId: "co_kmerlog", citations: [] })).rejects.toMatchObject({ status: 404 });
  });

  it("la réinitialisation de la démo conserve les vraies entreprises", async () => {
    const c = await aliceCompany();
    await resetDemoData();
    const snap = await getSnapshot(c.id, alice.email);
    expect(snap.company.id).toBe(c.id);
  });
});
