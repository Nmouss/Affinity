import { describe, expect, it } from "vitest";
import { buildMission, parseBudget } from "@/lib/director/mission";

describe("buildMission", () => {
  it("turns the demo text into a shared Christmas mission with the seated sprites", () => {
    expect(buildMission("Family Christmas tree, under $200", ["son", "wife"])).toEqual({
      occasion: "Christmas",
      budget: 200,
      freeText: "Family Christmas tree, under $200",
      type: "shared",
      invitedSpriteIds: ["son", "wife"],
    });
  });

  it("parses budgets and defaults to $200", () => {
    expect(parseBudget("Birthday gift under $1,250.50")).toBe(1250.5);
    expect(parseBudget("a lamp under 80")).toBe(80);
    expect(parseBudget("something cozy")).toBe(200);
  });

  // Spoken missions come through Web Speech transcripts as digits, not "$", so "under 200 dollars"
  // must parse the same as typed "under $200" (the bare "under <number>" branch already covers this;
  // these guard it explicitly since spoken budgets are a voice-feature requirement).
  it("parses spoken-style budgets without a dollar sign", () => {
    expect(parseBudget("Find Christmas decorations under $200")).toBe(200);
    expect(parseBudget("Find Christmas decorations under 200 dollars")).toBe(200);
    expect(parseBudget("ornaments under 150 dollars for the tree")).toBe(150);
  });
});
