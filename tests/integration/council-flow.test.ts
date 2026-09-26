import { describe, expect, it } from "vitest";
import { runCouncil } from "@/lib/agents/graph";

describe("council flow", () => {
  it("creates an in-budget bundle without breaking the height rule", async () => {
    const state = await runCouncil({
      mission: { occasion: "Christmas", budget: 200, freeText: "Family tree", type: "shared", invitedSpriteIds: ["wife"] },
      opinions: [{ spriteId: "wife", say: "Keep it small", hardRules: [{ type: "maxHeight", inches: 48, why: "Small room" }], wishes: ["warm lights"], vetoes: [] }],
      scores: [],
      revisionCount: 0,
    });
    expect(state.bundle?.total).toBeLessThanOrEqual(200);
    expect(state.bundle?.items.find((item) => item.slot === "tree")?.heightIn).toBeLessThanOrEqual(48);
  });
});
