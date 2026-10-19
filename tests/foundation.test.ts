import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "./setup-db";
import { ALL_TOOLS, AGENT_MODULES, TOOL_MAP } from "@/lib/agent/registry";
import { NAV, LEVELS } from "@/components/workspace/module-catalog";
import { moduleState, forCompany } from "@/lib/modules/state";
import { proposeExternalMessage } from "@/lib/workspace/actions";
import { decideApproval, createCompany } from "@/lib/workspace/service";
import { readData, resetDemoData, withData } from "@/lib/workspace/store";

describe("fondation : registre des outils", () => {
  it("la recherche juridique reste le premier outil, noms uniques", () => {
    expect(ALL_TOOLS[0].name).toBe("rechercher_textes_juridiques");
    expect(new Set(ALL_TOOLS.map((t) => t.name)).size).toBe(ALL_TOOLS.length);
    expect(TOOL_MAP.size).toBe(ALL_TOOLS.length);
    expect(AGENT_MODULES[0].id).toBe("core");
  });
});

describe("fondation : navigation par niveau", () => {
  it("chaque entrée a un niveau connu et un id unique", () => {
    const levels = new Set(LEVELS.map((l) => l.id));
    expect(NAV.every((n) => levels.has(n.level))).toBe(true);
    expect(new Set(NAV.map((n) => n.id)).size).toBe(NAV.length);
    for (const level of ["entrepreneur", "entreprise", "etat", "connecteurs"]) expect(NAV.some((n) => n.level === level)).toBe(true);
    expect(NAV.filter((n) => n.level === "etat").every((n) => n.demoOnly)).toBe(true);
  });
});

describe("fondation : état des modules", () => {
  beforeEach(useTempDb);
  const seed = () => ({ items: [{ id: "it_demo", companyId: "co_kmerlog", isExample: true }] as { id: string; companyId: string; isExample?: boolean }[] });

  it("seed appliqué une fois, réinitialisation qui garde les vraies entreprises", async () => {
    const real = await createCompany({ name: "Réelle SARL", sector: "Services", ownerEmail: "r@demo.example.com" });
    await withData((d) => {
      const st = moduleState(d, "test", seed);
      st.items.push({ id: "it_real", companyId: real.id });
      st.items.push({ id: "it_demo2", companyId: "co_kmerlog" });
    });
    expect(moduleState(await readData(), "test", seed).items.map((i) => i.id).sort()).toEqual(["it_demo", "it_demo2", "it_real"]);
    await resetDemoData();
    const after = moduleState(await readData(), "test", seed).items;
    expect(after.map((i) => i.id).sort()).toEqual(["it_demo", "it_real"]);
    expect(forCompany(after, real.id)).toHaveLength(1);
  });
});

describe("fondation : actions externes des modules", () => {
  beforeEach(useTempDb);

  it("email : approbation + feu vert juridique attaché", async () => {
    const { approval } = await proposeExternalMessage("co_kmerlog", {
      module: "test", type: "test_contact", title: "Contacter l'opérateur", summary: "test",
      to: ["contact@operateur.example.com"], subject: "Licence opérateur", body: "Demande d'information sur la licence d'opérateur de réseau.",
    });
    expect(approval.status).toBe("en_attente");
    expect(approval.module).toBe("test");
    expect(approval.legalCheck?.label).toBeTruthy();
    const stored = (await readData()).approvals.find((a) => a.id === approval.id)!;
    expect(stored.legalCheck).toBeTruthy();
  });

  it("WhatsApp : canal démo, envoi toujours simulé après validation", async () => {
    const { approval, email } = await proposeExternalMessage("co_kmerlog", {
      module: "comms", type: "comms_reponse", title: "Répondre sur WhatsApp", summary: "test",
      channel: "whatsapp", to: ["+237 6XX XX XX 99"], subject: "Réponse", body: "Bonjour, merci pour votre message.",
    });
    expect(email.channel).toBe("whatsapp");
    const res = await decideApproval(approval.id, "approuver", "Freddy");
    expect(res).toMatchObject({ status: "approuvee", emailStatus: "simule" });
  });

  it("refuse un numéro invalide et un email invalide", async () => {
    await expect(proposeExternalMessage("co_kmerlog", { module: "t", type: "t", title: "t", summary: "t", channel: "whatsapp", to: ["pas un numéro"], subject: "s", body: "b" })).rejects.toThrow();
    await expect(proposeExternalMessage("co_kmerlog", { module: "t", type: "t", title: "t", summary: "t", to: ["pas-un-email"], subject: "s", body: "b" })).rejects.toThrow();
  });
});
