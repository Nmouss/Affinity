import type { TasteProfile, TasteTrait } from "./types";

export const TASTE_TRAITS: readonly TasteTrait[] = [
  "minimal",
  "expressive",
  "casual",
  "formal",
  "neutral",
  "colorful",
  "classic",
  "trendy",
  "practical",
  "aesthetic",
  "budgetSensitive",
  "premium",
  "oversized",
  "fitted",
];

/** Consumer-facing words for each trait; these are what the summary and taste labels show. */
export const TRAIT_LABELS: Record<TasteTrait, string> = {
  minimal: "minimal",
  expressive: "expressive",
  casual: "casual",
  formal: "dressy",
  neutral: "neutral tones",
  colorful: "colorful",
  classic: "classic",
  trendy: "trendy",
  practical: "practical",
  aesthetic: "looks-first",
  budgetSensitive: "value-minded",
  premium: "premium",
  oversized: "roomy",
  fitted: "fitted",
};

/**
 * How much each trait matters when matching a gift, 0..1. A product heuristic, not a measurement:
 * style axes that change what a shopper would pick rank high, fit axes (mostly clothing) rank low.
 */
export const GIFT_TRAIT_PRIORITY: Record<TasteTrait, number> = {
  minimal: 0.9,
  expressive: 0.9,
  practical: 0.85,
  aesthetic: 0.85,
  neutral: 0.8,
  colorful: 0.8,
  classic: 0.7,
  trendy: 0.7,
  budgetSensitive: 0.65,
  premium: 0.65,
  casual: 0.6,
  formal: 0.6,
  oversized: 0.3,
  fitted: 0.3,
};

export function emptyProfile(now: string): TasteProfile {
  return { version: 1, traits: {}, completedComparisonIds: [], updatedAt: now };
}
