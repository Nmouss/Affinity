import { describe, expect, it } from "vitest";
import {
  applyChoice,
  CONFIDENCE_STEP,
  CONTRADICTION_PENALTY,
  DEFAULT_SCORE,
  emptyProfile,
  LEARNING_RATE,
  preferenceFromEvidence,
  TASTE_COMPARISONS,
  TASTE_TRAITS,
  undoChoice,
  type TasteComparison,
} from "@/lib/taste";

const T0 = "2026-09-26T00:00:00.000Z";
const T1 = "2026-09-26T00:01:00.000Z";
const mug = TASTE_COMPARISONS[0]!; // minimal vs expressive, separation 0.8
const notebook = TASTE_COMPARISONS[7]!; // same traits, separation 0.7

describe("applyChoice", () => {
  it("is deterministic and moves target traits by learningRate × separation", () => {
    const a = applyChoice(emptyProfile(T0), mug, "left", T1);
    const b = applyChoice(emptyProfile(T0), mug, "left", T1);
    expect(a).toEqual(b);
    expect(a.traits.minimal?.score).toBeCloseTo(DEFAULT_SCORE + LEARNING_RATE * 0.8);
    expect(a.traits.expressive?.score).toBeCloseTo(DEFAULT_SCORE - LEARNING_RATE * 0.8);
    expect(a.completedComparisonIds).toEqual([mug.id]);
    expect(a.updatedAt).toBe(T1);
  });

  it("keeps opposite traits independent (they need not sum to 1)", () => {
    const wide: TasteComparison = {
      ...mug,
      id: "c-wide",
      left: { ...mug.left, traits: { minimal: 1, expressive: 0.9 } },
      right: { ...mug.right, traits: { minimal: 0, expressive: 0.1 } },
    };
    const next = applyChoice(emptyProfile(T0), wide, "left", T1);
    expect(next.traits.minimal!.score + next.traits.expressive!.score).not.toBeCloseTo(1);
  });

  it("clamps scores to 0..1 no matter how many times a side is picked", () => {
    let profile = emptyProfile(T0);
    for (let i = 0; i < 12; i += 1) {
      profile = applyChoice(profile, { ...mug, id: `c-${i}` }, "left", T1);
    }
    for (const trait of TASTE_TRAITS) {
      const pref = profile.traits[trait];
      if (!pref) continue;
      expect(pref.score).toBeGreaterThanOrEqual(0);
      expect(pref.score).toBeLessThanOrEqual(1);
      expect(pref.confidence).toBeLessThanOrEqual(1);
    }
    expect(profile.traits.minimal!.score).toBe(1);
    expect(profile.traits.expressive!.score).toBe(0);
  });

  it("appends evidence naming the pair, the winner and the loser", () => {
    const next = applyChoice(emptyProfile(T0), mug, "right", T1);
    expect(next.traits.expressive?.evidence).toEqual([
      {
        comparisonId: mug.id,
        selectedItemId: mug.right.id,
        rejectedItemId: mug.left.id,
        delta: expect.closeTo(LEARNING_RATE * 0.8, 10),
        recordedAt: T1,
      },
    ]);
  });

  it("raises confidence only for meaningful separation", () => {
    const strong = applyChoice(emptyProfile(T0), mug, "left", T1);
    expect(strong.traits.minimal?.confidence).toBeCloseTo(CONFIDENCE_STEP);
    const weak: TasteComparison = {
      ...mug,
      id: "c-weak",
      left: { ...mug.left, traits: { minimal: 0.55, expressive: 0.45 } },
      right: { ...mug.right, traits: { minimal: 0.45, expressive: 0.55 } },
    };
    const meh = applyChoice(emptyProfile(T0), weak, "left", T1);
    expect(meh.traits.minimal?.confidence).toBe(0);
    expect(meh.traits.minimal?.score).toBeGreaterThan(DEFAULT_SCORE);
  });

  it("treats a repeated comparison as a no-op", () => {
    const once = applyChoice(emptyProfile(T0), mug, "left", T1);
    expect(applyChoice(once, mug, "right", "2026-09-27T00:00:00.000Z")).toBe(once);
  });

  it("marks skip and neither as completed without touching traits", () => {
    const skipped = applyChoice(emptyProfile(T0), mug, "skip", T1);
    const neither = applyChoice(emptyProfile(T0), mug, "neither", T1);
    for (const profile of [skipped, neither]) {
      expect(profile.traits).toEqual({});
      expect(profile.completedComparisonIds).toEqual([mug.id]);
      expect(profile.updatedAt).toBe(T1);
    }
  });

  it("moves the score back and lowers confidence on contradictory evidence", () => {
    const first = applyChoice(emptyProfile(T0), mug, "left", T1);
    const second = applyChoice(first, notebook, "right", T1);
    expect(second.traits.minimal!.score).toBeLessThan(first.traits.minimal!.score);
    expect(second.traits.minimal!.confidence).toBeCloseTo(CONFIDENCE_STEP - CONTRADICTION_PENALTY);
    expect(second.traits.minimal!.evidence).toHaveLength(2);
  });

  it("grows confidence when evidence agrees", () => {
    const first = applyChoice(emptyProfile(T0), mug, "left", T1);
    const second = applyChoice(first, notebook, "left", T1);
    expect(second.traits.minimal!.confidence).toBeCloseTo(2 * CONFIDENCE_STEP);
  });
});

describe("undoChoice", () => {
  it("restores the exact prior profile (except the timestamp)", () => {
    const before = applyChoice(emptyProfile(T0), mug, "left", T1);
    const after = applyChoice(before, notebook, "right", T1);
    expect(undoChoice(after, notebook.id, "2026-09-26T00:02:00.000Z")).toEqual({
      ...before,
      updatedAt: "2026-09-26T00:02:00.000Z",
    });
  });

  it("drops a trait entirely when its last evidence is undone", () => {
    const once = applyChoice(emptyProfile(T0), mug, "left", T1);
    const undone = undoChoice(once, mug.id, T1);
    expect(undone.traits).toEqual({});
    expect(undone.completedComparisonIds).toEqual([]);
  });

  it("reopens a skipped pair and ignores unknown ids", () => {
    const skipped = applyChoice(emptyProfile(T0), mug, "skip", T1);
    expect(undoChoice(skipped, mug.id, T1).completedComparisonIds).toEqual([]);
    expect(undoChoice(skipped, "nope", T1)).toBe(skipped);
  });

  it("can undo out of order and still match a fresh replay", () => {
    const a = applyChoice(emptyProfile(T0), mug, "left", T1);
    const b = applyChoice(a, notebook, "left", T1);
    const undoneFirst = undoChoice(b, mug.id, T1);
    const replay = applyChoice(emptyProfile(T0), notebook, "left", T1);
    expect(undoneFirst.traits).toEqual(replay.traits);
  });
});

describe("preferenceFromEvidence", () => {
  it("starts neutral with no evidence", () => {
    expect(preferenceFromEvidence([])).toEqual({ score: DEFAULT_SCORE, confidence: 0, evidence: [] });
  });
});
