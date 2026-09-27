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

  it("builds a Google Places mission for dinner and activity prompts", () => {
    expect(buildMission("Plan dinner and an activity in Midtown Atlanta under $150", ["wife"])).toMatchObject({
      kind: "plan",
      budget: 150,
      location: { label: "Midtown Atlanta" },
      planSlots: [{ id: "dinner" }, { id: "activity" }],
    });
  });

  it("parses budgets and defaults to $200", () => {
    expect(parseBudget("Birthday gift under $1,250.50")).toBe(1250.5);
    expect(parseBudget("a lamp under 80")).toBe(80);
    expect(parseBudget("something cozy")).toBe(200);
  });
});
