import { describe, expect, it } from "vitest";
import type { Bundle, Product, ShopperProfile } from "@/shared/types";
import { groupScore, itemAffinity, normalizeAffinity, recommendBundles, scoreIndividual } from "@/backend/core/scoring";
import { createShopperProfile } from "@/backend/core/taste";

function shopper(overrides: Partial<ShopperProfile> = {}): ShopperProfile {
  return {
    ...createShopperProfile({ id: "maya", name: "Maya", avatarId: "maya-avatar", category: "cookware" }),
    ...overrides,
  };
}

function bundle(overrides: Partial<Bundle> & Pick<Bundle, "id">): Bundle {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    productIds: overrides.productIds ?? [],
    totalPrice: overrides.totalPrice ?? 100,
    attributes: overrides.attributes ?? {},
    satisfies: overrides.satisfies ?? {},
    valueScore: overrides.valueScore ?? 0.5,
  };
}

describe("affinity and group scoring", () => {
  it("normalizes affinity to the inclusive zero-to-one bounds", () => {
    expect(normalizeAffinity(-5)).toBe(0);
    expect(normalizeAffinity(-1)).toBe(0);
    expect(normalizeAffinity(0)).toBe(0.5);
    expect(normalizeAffinity(1)).toBe(1);
    expect(normalizeAffinity(5)).toBe(1);
    expect(normalizeAffinity(Number.NaN)).toBe(0.5);
    expect(normalizeAffinity(Number.POSITIVE_INFINITY)).toBe(0.5);
  });

  it("ignores unknown taste dimensions", () => {
    const profile = shopper({
      preferences: { durability: 1, mysteryAxis: 1_000_000 },
      evidenceCounts: { durability: 1, mysteryAxis: 1_000_000 },
    });

    expect(scoreIndividual(profile, bundle({
      id: "candidate",
      attributes: { durability: 0, mysteryAxis: 1 },
    })).score).toBe(0.5);
  });

  it("does not apply category-specific taste evidence to another category", () => {
    const profile = shopper({
      preferences: { durability: 1 },
      evidenceCounts: { durability: 2 },
    });
    const product: Product = {
      id: "tent",
      name: "Tent",
      category: "shelter",
      price: 100,
      imageUrl: "/tent.png",
      attributes: { durability: 1 },
      facts: {},
      satisfies: {},
    };

    expect(itemAffinity(profile, product)).toBe(0.5);
  });

  it("uses the fairness formula and clamps inputs and result to zero through one", () => {
    expect(groupScore([0.8, 0.4], 0.6)).toBeCloseTo(0.48);
    expect(groupScore([-3, 2], 4)).toBeCloseTo(0.25);
    expect(groupScore([2], -1)).toBeCloseTo(0.9);
    expect(groupScore([Number.NaN], Number.NaN)).toBe(0.5);
    expect(() => groupScore([], 0.5)).toThrow("at least one shopper score");
  });

  it("filters ineligible bundles before ranking", () => {
    const shoppers = [shopper({ rules: ["noGlass"] })];
    const result = recommendBundles(
      [
        bundle({ id: "premium", name: "Premium", valueScore: 1, satisfies: { noGlass: false } }),
        bundle({ id: "balanced", name: "Balanced", valueScore: 0.5, satisfies: { noGlass: true } }),
      ],
      shoppers,
    );

    expect(result.selectedBundleId).toBe("balanced");
    expect(result.eligibleBundleIds).toEqual(["balanced"]);
    expect(result.groupScores).toEqual({ balanced: 0.5 });
    expect(result.rejectedBundles).toEqual([
      { bundleId: "premium", shopperId: "maya", violatedRequirement: "noGlass" },
    ]);
  });

  it("breaks equal-score ties deterministically by bundle id", () => {
    const result = recommendBundles(
      [bundle({ id: "zeta" }), bundle({ id: "alpha" })],
      [shopper()],
    );

    expect(result.selectedBundleId).toBe("alpha");
    expect(result.eligibleBundleIds).toEqual(["zeta", "alpha"]);
  });

  it("does not double-weight a duplicated shopper id", () => {
    const maya = shopper({
      preferences: { durability: 1 },
      evidenceCounts: { durability: 1 },
    });
    const candidate = bundle({ id: "candidate", attributes: { durability: 1 } });

    expect(recommendBundles([candidate], [maya, structuredClone(maya)]).individualScores).toHaveLength(1);
  });
});
