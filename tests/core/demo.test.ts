import { describe, expect, it } from "vitest";
import bundlesJson from "@/shared/data/bundles.json";
import expectations from "@/shared/data/demo-expectations.json";
import shoppersJson from "@/shared/data/shoppers.json";
import { recommendBundles } from "@/backend/core";
import type { Bundle, ShopperProfile } from "@/shared/types";

const bundles = bundlesJson as Bundle[];
const shoppers = shoppersJson as ShopperProfile[];

function shopperSet(ids: string[]): ShopperProfile[] {
  return ids.map((id) => {
    const shopper = shoppers.find((candidate) => candidate.id === id);
    if (!shopper) throw new Error(`Missing fixture shopper: ${id}`);
    return shopper;
  });
}

describe("fixed cabin demo", () => {
  it("selects Premium before the judge joins", () => {
    const result = recommendBundles(bundles, shopperSet(expectations.beforeJudge.shopperIds));
    const selected = bundles.find((bundle) => bundle.id === result.selectedBundleId);

    expect(selected?.name).toBe(expectations.beforeJudge.expectedSelectedBundle);
  });

  it("selects Balanced after the judge joins for rule and durability reasons", () => {
    const result = recommendBundles(bundles, shopperSet(expectations.afterJudge.shopperIds));
    const selected = bundles.find((bundle) => bundle.id === result.selectedBundleId);
    const rejectedPremium = result.rejectedBundles.find(
      (rejected) => rejected.bundleId === "premium-cabin" && rejected.shopperId === "judge",
    );
    const judgeBalanced = result.individualScores.find(
      (score) => score.bundleId === "balanced-cabin" && score.shopperId === "judge",
    );

    expect(selected?.name).toBe(expectations.afterJudge.expectedSelectedBundle);
    expect(rejectedPremium?.violatedRequirement).toBe(expectations.afterJudge.ineligibilityRule);
    expect(judgeBalanced?.reasons.join(" ")).toContain("durability");
    expect(result.groupScores["premium-cabin"]).toBeUndefined();
  });
});
