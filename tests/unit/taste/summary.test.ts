import { describe, expect, it } from "vitest";
import {
  applyChoice,
  confidenceLabel,
  emptyProfile,
  STILL_LEARNING,
  summarize,
  TASTE_COMPARISONS,
  tasteLabels,
  nextComparison,
} from "@/lib/taste";

const T = "2026-09-26T00:00:00.000Z";
const byId = (id: string) => TASTE_COMPARISONS.find((c) => c.id === id)!;

describe("summarize", () => {
  it("says still learning for an empty or barely-taught profile", () => {
    expect(summarize(emptyProfile(T))).toBe(STILL_LEARNING);
    expect(tasteLabels(emptyProfile(T))).toEqual([]);
    // One pair lifts a trait but not its confidence past the bar.
    expect(summarize(applyChoice(emptyProfile(T), byId("c-mug"), "left", T))).toBe(STILL_LEARNING);
  });

  it("names the strongest confident leans in consumer words, strongest first, at most three", () => {
    let profile = emptyProfile(T);
    profile = applyChoice(profile, byId("c-mug"), "left", T); // minimal
    profile = applyChoice(profile, byId("c-notebook"), "left", T); // minimal again
    profile = applyChoice(profile, byId("c-scarf"), "left", T); // neutral tones
    profile = applyChoice(profile, byId("c-watch"), "left", T); // neutral again
    profile = applyChoice(profile, byId("c-lamp"), "left", T); // practical
    profile = applyChoice(profile, byId("c-tote"), "left", T); // practical again
    profile = applyChoice(profile, byId("c-sweater"), "left", T); // casual, once
    const summary = summarize(profile);
    expect(summary.split(", ")).toHaveLength(3);
    expect(summary.startsWith("minimal")).toBe(true);
    expect(summary).toContain("neutral tones");
    expect(summary).toContain("practical");
    expect(summary).not.toMatch(/\d/);
    expect(tasteLabels(profile, 2)).toEqual(summary.split(", ").slice(0, 2));
  });
});

describe("confidenceLabel", () => {
  it("moves through the tiers as evidence accumulates", () => {
    let profile = emptyProfile(T);
    expect(confidenceLabel(profile)).toBe("nothing learned yet");
    profile = applyChoice(profile, byId("c-mug"), "left", T);
    expect(confidenceLabel(profile)).toBe("just a hunch");
    for (const id of ["c-scarf", "c-sneaker", "c-lamp"]) profile = applyChoice(profile, byId(id), "left", T);
    expect(confidenceLabel(profile)).toBe("getting a feel");
    for (;;) {
      const next = nextComparison(profile, TASTE_COMPARISONS);
      if (!next) break;
      profile = applyChoice(profile, next, "left", T);
    }
    expect(confidenceLabel(profile)).toBe("pretty sure");
  });

  it("ignores skipped pairs when counting what was learned", () => {
    let profile = emptyProfile(T);
    for (const comparison of TASTE_COMPARISONS) profile = applyChoice(profile, comparison, "skip", T);
    expect(confidenceLabel(profile)).toBe("nothing learned yet");
    expect(summarize(profile)).toBe(STILL_LEARNING);
  });
});
