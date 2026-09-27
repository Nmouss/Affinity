import { describe, expect, it } from "vitest";
import { DISLIKE_SCORE, LIKE_SCORE, MIN_CONFIDENCE, toAgentTaste } from "@/lib/taste/agents";
import { emptyProfile } from "@/lib/taste/traits";
import type { TasteProfile, TraitPreference } from "@/lib/taste/types";

const evidence = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ comparisonId: `c${i}`, selectedItemId: "a", rejectedItemId: "b", delta: 0.3, recordedAt: "2026-09-26T00:00:00Z" }));

const pref = (score: number, confidence: number, n = 2): TraitPreference => ({ score, confidence, evidence: evidence(n) });

describe("toAgentTaste", () => {
  it("is empty and unconfident for a fresh profile", () => {
    const taste = toAgentTaste(emptyProfile("2026-09-26T00:00:00Z"));
    expect(taste).toMatchObject({ likes: [], dislikes: [], confidence: 0, evidenceCount: 0, traits: {} });
    expect(typeof taste.summary).toBe("string");
  });

  it("turns confident leans into likes and dislikes, strongest first, and counts evidence", () => {
    const profile: TasteProfile = {
      ...emptyProfile("2026-09-26T00:00:00Z"),
      traits: {
        casual: pref(0.9, 0.7, 3),
        colorful: pref(0.7, 0.5, 2),
        formal: pref(0.2, 0.6, 2),
        premium: pref(0.35, 0.4, 1),
        minimal: pref(0.95, MIN_CONFIDENCE - 0.05, 1), // strong lean, too little confidence
        trendy: pref(LIKE_SCORE - 0.01, 0.9, 1), // confident, but not a lean
      },
    };
    const taste = toAgentTaste(profile);
    expect(taste.likes).toEqual(["casual", "colorful"]);
    expect(taste.dislikes).toEqual(["formal", "premium"]);
    expect(taste.evidenceCount).toBe(10);
    expect(taste.traits.casual).toEqual({ score: 0.9, confidence: 0.7 });
    expect(taste.traits.minimal).toBeDefined();
    expect(taste.confidence).toBeGreaterThan(0);
    expect(taste.confidence).toBeLessThanOrEqual(1);
  });

  it("skips traits with no evidence and never invents a house rule", () => {
    const profile: TasteProfile = { ...emptyProfile("now"), traits: { casual: pref(0.9, 0.9, 0) } };
    const taste = toAgentTaste(profile);
    expect(taste.traits).toEqual({});
    expect(Object.keys(taste)).toEqual(["summary", "likes", "dislikes", "confidence", "traits", "evidenceCount"]);
    expect(DISLIKE_SCORE).toBeLessThan(LIKE_SCORE);
  });
});
