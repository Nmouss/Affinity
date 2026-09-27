import { TRAIT_LABELS } from "./traits";
import type { TasteProfile, TasteTrait, TraitPreference } from "./types";

// Consumer wording only: no numbers, no vectors. Thresholds are product heuristics.

/** A trait must lean at least this far to be named in the summary. */
export const SUMMARY_SCORE = 0.6;
/** ...and we must be at least this sure of it. */
export const SUMMARY_CONFIDENCE = 0.4;
export const SUMMARY_MAX_TRAITS = 3;
export const STILL_LEARNING = "still learning";

function learned(profile: TasteProfile): [TasteTrait, TraitPreference][] {
  return Object.entries(profile.traits) as [TasteTrait, TraitPreference][];
}

/** "casual, neutral tones, practical" — the strongest confident leans, or "still learning". */
export function summarize(profile: TasteProfile): string {
  const named = learned(profile)
    .filter(([, pref]) => pref.score >= SUMMARY_SCORE && pref.confidence >= SUMMARY_CONFIDENCE)
    .sort(([, a], [, b]) => b.score * b.confidence - a.score * a.confidence)
    .slice(0, SUMMARY_MAX_TRAITS)
    .map(([trait]) => TRAIT_LABELS[trait]);
  return named.length > 0 ? named.join(", ") : STILL_LEARNING;
}

export type ConfidenceTier = "nothing learned yet" | "just a hunch" | "getting a feel" | "pretty sure";

/** Tier gates: pairs that taught something, and mean trait confidence (one clean pair adds 0.2). */
export const HUNCH_MAX = { comparisons: 3, mean: 0.15 } as const;
export const FEEL_MAX = { comparisons: 7, mean: 0.28 } as const;

/** Evidence-aware wording: how many pairs taught us something and how sure the traits are on average. */
export function confidenceLabel(profile: TasteProfile): ConfidenceTier {
  const traits = learned(profile).filter(([, pref]) => pref.evidence.length > 0);
  if (traits.length === 0) return "nothing learned yet";
  const comparisons = new Set(traits.flatMap(([, pref]) => pref.evidence.map((item) => item.comparisonId))).size;
  const mean = traits.reduce((sum, [, pref]) => sum + pref.confidence, 0) / traits.length;
  if (comparisons < HUNCH_MAX.comparisons || mean < HUNCH_MAX.mean) return "just a hunch";
  if (comparisons < FEEL_MAX.comparisons || mean < FEEL_MAX.mean) return "getting a feel";
  return "pretty sure";
}

/** The traits worth showing as rounded labels, strongest first (same bar as the summary). */
export function tasteLabels(profile: TasteProfile, max = SUMMARY_MAX_TRAITS): string[] {
  return summarize(profile) === STILL_LEARNING ? [] : summarize(profile).split(", ").slice(0, max);
}
