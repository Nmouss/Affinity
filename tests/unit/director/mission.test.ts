import { describe, expect, it } from "vitest";
import { buildMission, parseBudget } from "@/lib/director/mission";

describe("buildMission", () => {
  it("turns the demo text into a shared Christmas mission with the seated sprites", () => {
    expect(buildMission("Family Christmas tree, under $200", ["son", "wife"])).toEqual({
      occasion: "Christmas",
      budget: 200,
      freeText: "Family Christmas tree, under $200",
      type: "shared",
      kind: "shopping",
      invitedSpriteIds: ["son", "wife"],
    });
  });

  it("parses budgets and defaults to $200", () => {
    expect(parseBudget("Birthday gift under $1,250.50")).toBe(1250.5);
    expect(parseBudget("a lamp under 80")).toBe(80);
    expect(parseBudget("something cozy")).toBe(200);
  });
});

describe("buildGiftMission", () => {
  it("puts the recipient first, drops duplicates, and fills one explicit gift slot", async () => {
    const { buildGiftMission, GIFT_SLOT_ID } = await import("@/lib/director/mission");
    const mission = buildGiftMission({
      recipientId: "daughter",
      advisorIds: ["wife", "daughter", "son", "wife"],
      budget: 60,
      slotQuery: "cozy scarf for a teenager",
    });
    expect(mission).toMatchObject({
      type: "gift",
      kind: "shopping",
      occasion: "Christmas",
      budget: 60,
      recipientId: "daughter",
      invitedSpriteIds: ["daughter", "wife", "son"],
      shoppingSlots: [{ id: GIFT_SLOT_ID, query: "cozy scarf for a teenager", quantity: 1 }],
    });
    expect(mission.freeText).toContain("cozy scarf");
  });

  it("falls back to the default budget when the amount is missing or nonsense", async () => {
    const { buildGiftMission, DEFAULT_BUDGET } = await import("@/lib/director/mission");
    expect(buildGiftMission({ recipientId: "son", advisorIds: [], budget: Number.NaN, slotQuery: "x" }).budget).toBe(DEFAULT_BUDGET);
    expect(buildGiftMission({ recipientId: "son", advisorIds: [], budget: -5, slotQuery: "x" }).budget).toBe(DEFAULT_BUDGET);
  });

  it("keeps the recipient invited even with no advisors", async () => {
    const { buildGiftMission } = await import("@/lib/director/mission");
    expect(buildGiftMission({ recipientId: "son", advisorIds: [], budget: 40, slotQuery: "x" }).invitedSpriteIds).toEqual(["son"]);
  });
});
