import { describe, expect, it } from "vitest";
import { studioStatus } from "@/lib/studio/registry";

describe("emplacement ai-cofounder-studio", () => {
  it("expose la source et un état cohérent", () => {
    const s = studioStatus();
    expect(s.source.repo).toContain("ai-cofounder-studio");
    expect(s.state).toBe(s.modules.length ? "integre" : "en_attente");
    for (const m of s.modules) expect(m.provenance.commit).toMatch(/^[0-9a-f]{7,40}$/);
  });
});
