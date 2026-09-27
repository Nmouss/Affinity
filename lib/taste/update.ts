import type { TasteChoice, TasteComparison, TasteEvidence, TasteProfile, TasteTrait, TraitPreference } from "./types";

// The whole learning rule lives here and is deterministic: a trait's score and confidence are a
// pure fold over its evidence list, so applying a choice and undoing it are both "rebuild the trait
// from its evidence". Numbers below are product heuristics tuned for ~10 comparisons, not science.

/** Score step per unit of separation between the picked and passed item. */
export const LEARNING_RATE = 0.35;
/** A pair must separate a trait by at least this much (0..1) before it counts toward confidence. */
export const MEANINGFUL_SEPARATION = 0.3;
/** Confidence gained from one meaningful, consistent comparison. */
export const CONFIDENCE_STEP = 0.2;
/** Confidence lost when a comparison points the other way from everything before it. */
export const CONTRADICTION_PENALTY = 0.1;
/** Where every trait starts: no lean. */
export const DEFAULT_SCORE = 0.5;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Rebuilds score and confidence from evidence alone (see the note at the top of this file). */
export function preferenceFromEvidence(evidence: TasteEvidence[]): TraitPreference {
  let score = DEFAULT_SCORE;
  let confidence = 0;
  let net = 0;
  for (const item of evidence) {
    score = clamp01(score + item.delta);
    const contradicts = net !== 0 && Math.sign(item.delta) === -Math.sign(net);
    const meaningful = Math.abs(item.delta) >= LEARNING_RATE * MEANINGFUL_SEPARATION;
    if (contradicts) confidence = clamp01(confidence - CONTRADICTION_PENALTY);
    else if (meaningful) confidence = clamp01(confidence + CONFIDENCE_STEP);
    net += item.delta;
  }
  return { score, confidence, evidence };
}

function rebuildTraits(
  traits: TasteProfile["traits"],
  patch: Partial<Record<TasteTrait, TasteEvidence[]>>,
): TasteProfile["traits"] {
  const next: TasteProfile["traits"] = { ...traits };
  for (const [trait, evidence] of Object.entries(patch) as [TasteTrait, TasteEvidence[]][]) {
    if (evidence.length === 0) delete next[trait];
    else next[trait] = preferenceFromEvidence(evidence);
  }
  return next;
}

/**
 * Records one answer. Picking a side moves every target trait by
 * `learningRate × (selectedTrait − rejectedTrait)`; "neither" and "skip" only mark the pair done.
 * A pair already in completedComparisonIds is a no-op (same object back).
 */
export function applyChoice(
  profile: TasteProfile,
  comparison: TasteComparison,
  choice: TasteChoice,
  now: string,
  learningRate = LEARNING_RATE,
): TasteProfile {
  if (profile.completedComparisonIds.includes(comparison.id)) return profile;
  const completedComparisonIds = [...profile.completedComparisonIds, comparison.id];
  if (choice === "neither" || choice === "skip") return { ...profile, completedComparisonIds, updatedAt: now };

  const selected = choice === "left" ? comparison.left : comparison.right;
  const rejected = choice === "left" ? comparison.right : comparison.left;
  const patch: Partial<Record<TasteTrait, TasteEvidence[]>> = {};
  for (const trait of comparison.targetTraits) {
    const delta = learningRate * ((selected.traits[trait] ?? 0) - (rejected.traits[trait] ?? 0));
    const evidence: TasteEvidence = {
      comparisonId: comparison.id,
      selectedItemId: selected.id,
      rejectedItemId: rejected.id,
      delta,
      recordedAt: now,
    };
    patch[trait] = [...(profile.traits[trait]?.evidence ?? []), evidence];
  }
  return { ...profile, traits: rebuildTraits(profile.traits, patch), completedComparisonIds, updatedAt: now };
}

/** Forgets one comparison: its evidence is dropped, affected traits rebuilt, the pair reopened. */
export function undoChoice(profile: TasteProfile, comparisonId: string, now: string): TasteProfile {
  if (!profile.completedComparisonIds.includes(comparisonId)) return profile;
  const patch: Partial<Record<TasteTrait, TasteEvidence[]>> = {};
  for (const [trait, preference] of Object.entries(profile.traits) as [TasteTrait, TraitPreference][]) {
    if (preference.evidence.some((item) => item.comparisonId === comparisonId)) {
      patch[trait] = preference.evidence.filter((item) => item.comparisonId !== comparisonId);
    }
  }
  return {
    ...profile,
    traits: rebuildTraits(profile.traits, patch),
    completedComparisonIds: profile.completedComparisonIds.filter((id) => id !== comparisonId),
    updatedAt: now,
  };
}
