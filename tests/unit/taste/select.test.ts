import { describe, expect, it } from "vitest";
import {
  applyChoice,
  confoundCount,
  emptyProfile,
  GIFT_TRAIT_PRIORITY,
  nextComparison,
  progress,
  TASTE_COMPARISONS,
  unresolvedTraits,
  type TasteComparison,
} from "@/lib/taste";

const T = "2026-09-26T00:00:00.000Z";

describe("nextComparison", () => {
  it("walks all ten pairs without repeating and then stops", () => {
    let profile = emptyProfile(T);
    const seen: string[] = [];
    for (let guard = 0; guard < 20; guard += 1) {
      const next = nextComparison(profile, TASTE_COMPARISONS);
      if (!next) break;
      seen.push(next.id);
      profile = applyChoice(profile, next, guard % 2 === 0 ? "left" : "right", T);
    }
    expect(seen).toHaveLength(TASTE_COMPARISONS.length);
    expect(new Set(seen).size).toBe(TASTE_COMPARISONS.length);
    expect(nextComparison(profile, TASTE_COMPARISONS)).toBeNull();
  });

  it("is deterministic for the same profile", () => {
    const profile = applyChoice(emptyProfile(T), TASTE_COMPARISONS[0]!, "left", T);
    expect(nextComparison(profile, TASTE_COMPARISONS)).toBe(nextComparison(profile, TASTE_COMPARISONS));
  });

  it("chases the highest-value unresolved trait first", () => {
    // minimal/expressive carry the top priority, and the mug pair separates them most cleanly.
    expect(nextComparison(emptyProfile(T), TASTE_COMPARISONS)?.id).toBe("c-mug");
  });

  it("prefers a clean pair over a confounded one with the same targets", () => {
    const clean = TASTE_COMPARISONS[0]!;
    const muddy: TasteComparison = {
      ...clean,
      id: "c-muddy",
      left: { ...clean.left, traits: { ...clean.left.traits, colorful: 0.9, trendy: 0.9 } },
    };
    expect(nextComparison(emptyProfile(T), [muddy, clean])?.id).toBe(clean.id);
  });

  it("falls back to curated order once every important trait is confident", () => {
    // Only the low-priority fit axis stays in play when the priority map says nothing else matters.
    const priority = { ...GIFT_TRAIT_PRIORITY };
    for (const trait of Object.keys(priority) as (keyof typeof priority)[]) priority[trait] = 0;
    const profile = applyChoice(emptyProfile(T), TASTE_COMPARISONS[0]!, "skip", T);
    expect(unresolvedTraits(profile, priority)).toEqual([]);
    expect(nextComparison(profile, TASTE_COMPARISONS, priority)?.id).toBe("c-scarf");
  });

  it("breaks value ties by stage then id", () => {
    const base = TASTE_COMPARISONS[0]!;
    const later: TasteComparison = { ...base, id: "c-a", stage: "resolve" };
    const earlier: TasteComparison = { ...base, id: "c-z", stage: "broad" };
    expect(nextComparison(emptyProfile(T), [later, earlier])?.id).toBe("c-z");
    const sameStage: TasteComparison = { ...base, id: "c-b", stage: "broad" };
    expect(nextComparison(emptyProfile(T), [earlier, sameStage])?.id).toBe("c-b");
  });
});

describe("curated comparisons", () => {
  it.each(TASTE_COMPARISONS.map((comparison) => [comparison.id, comparison] as const))(
    "%s holds category and non-target traits constant",
    (_id, comparison) => {
      expect(comparison.left.category).toBe(comparison.right.category);
      expect(comparison.left.id).not.toBe(comparison.right.id);
      expect(confoundCount(comparison)).toBe(0);
      for (const trait of comparison.targetTraits) {
        const gap = Math.abs((comparison.left.traits[trait] ?? 0) - (comparison.right.traits[trait] ?? 0));
        expect(gap, `${comparison.id} ${trait}`).toBeGreaterThanOrEqual(0.6);
      }
      expect(comparison.left.imageUrl).toMatch(/^\/taste\/[a-z-]+\.svg$/);
    },
  );

  it("is ten pairs staged broad → refine → resolve with unique ids", () => {
    expect(TASTE_COMPARISONS).toHaveLength(10);
    expect(TASTE_COMPARISONS.map((c) => c.stage)).toEqual([
      ...Array<string>(4).fill("broad"),
      ...Array<string>(4).fill("refine"),
      ...Array<string>(2).fill("resolve"),
    ]);
    expect(new Set(TASTE_COMPARISONS.map((c) => c.id)).size).toBe(10);
  });
});

describe("progress", () => {
  it("counts only pairs from the given set", () => {
    let profile = applyChoice(emptyProfile(T), TASTE_COMPARISONS[0]!, "left", T);
    profile = { ...profile, completedComparisonIds: [...profile.completedComparisonIds, "c-elsewhere"] };
    expect(progress(profile, TASTE_COMPARISONS)).toEqual({ done: 1, total: 10 });
  });
});
