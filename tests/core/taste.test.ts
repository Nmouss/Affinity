import { describe, expect, it } from "vitest";
import type { ComparisonChoice, ComparisonPair, ShopperProfile, TasteAxis } from "@/shared/types";
import { applyComparison, createShopperProfile } from "@/backend/core/taste";

const axes: TasteAxis[] = ["durability", "compactness", "simpleControls", "expressiveStyle"];

function profile(): ShopperProfile {
  return createShopperProfile({
    id: "maya",
    name: "Maya",
    avatarId: "maya-avatar",
    category: "cookware",
    rules: ["noGlass"],
  });
}

function pair(axis: TasteAxis): ComparisonPair {
  return {
    pairId: `pair-${axis}`,
    axis,
    leftProductId: "left-product",
    rightProductId: "right-product",
    leftValue: 0.75,
    rightValue: -0.25,
  };
}

describe("taste updates", () => {
  it.each([
    ["left", 0.75],
    ["right", -0.25],
  ] as const satisfies readonly (readonly [ComparisonChoice, number])[])(
    "%s updates only its assigned taste axis",
    (choice, expectedValue) => {
      for (const axis of axes) {
        const initial = profile();
        const updated = applyComparison(initial, pair(axis), choice);

        for (const otherAxis of axes) {
          expect(updated.preferences[otherAxis]).toBe(otherAxis === axis ? expectedValue : 0);
          expect(updated.evidenceCounts[otherAxis]).toBe(otherAxis === axis ? 1 : 0);
        }
      }
    },
  );

  it.each(["skip", "neither"] as const)("%s adds no taste evidence", (choice) => {
    const initial = profile();
    const updated = applyComparison(initial, pair("durability"), choice);

    expect(updated.preferences).toEqual(initial.preferences);
    expect(updated.evidenceCounts).toEqual(initial.evidenceCounts);
  });

  it("preserves rules while applying a taste update", () => {
    const initial = profile();
    const updated = applyComparison(initial, pair("compactness"), "left");

    expect(updated.rules).toEqual(["noGlass"]);
    expect(updated.rules).not.toBe(initial.rules);
  });
});
