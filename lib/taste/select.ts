import { GIFT_TRAIT_PRIORITY, TASTE_TRAITS } from "./traits";
import type { TasteComparison, TasteProfile, TasteStage, TasteTrait } from "./types";

// Which pair to show next. A transparent heuristic: chase important traits we're still unsure
// about, prefer pairs that separate them cleanly, penalize pairs that differ on other things too.

/** Traits below this confidence still need resolving. */
export const LOW_CONFIDENCE = 0.5;
/** Traits with at least this priority are worth chasing adaptively. */
export const IMPORTANT_PRIORITY = 0.5;
/** Non-target traits may differ by this much before the pair counts as confounded. */
export const CONFOUND_EPSILON = 0.15;
/** Value lost per confounding trait when ranking pairs. */
export const CONFOUND_PENALTY = 0.25;

const STAGE_ORDER: Record<TasteStage, number> = { broad: 0, refine: 1, resolve: 2 };

export function separation(comparison: TasteComparison, trait: TasteTrait): number {
  return Math.abs((comparison.left.traits[trait] ?? 0) - (comparison.right.traits[trait] ?? 0));
}

/** Non-target traits on which the two items differ noticeably: the more, the less we learn. */
export function confoundCount(comparison: TasteComparison): number {
  return TASTE_TRAITS.filter(
    (trait) => !comparison.targetTraits.includes(trait) && separation(comparison, trait) > CONFOUND_EPSILON,
  ).length;
}

/** Important traits the profile is still unsure about. */
export function unresolvedTraits(profile: TasteProfile, priority = GIFT_TRAIT_PRIORITY): TasteTrait[] {
  return TASTE_TRAITS.filter(
    (trait) => priority[trait] >= IMPORTANT_PRIORITY && (profile.traits[trait]?.confidence ?? 0) < LOW_CONFIDENCE,
  );
}

function pairValue(comparison: TasteComparison, unresolved: TasteTrait[], priority: Record<TasteTrait, number>): number {
  const gain = comparison.targetTraits
    .filter((trait) => unresolved.includes(trait))
    .reduce((sum, trait) => sum + separation(comparison, trait) * priority[trait], 0);
  return gain - confoundCount(comparison) * CONFOUND_PENALTY;
}

const byStageThenId = (a: TasteComparison, b: TasteComparison) =>
  STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.id.localeCompare(b.id);

/**
 * 1. important low-confidence traits → 2. drop completed pairs → 3. score remaining pairs by target
 * separation minus confounds → 4. best wins (ties: broad before refine before resolve, then id) →
 * 5. nothing adaptive left: the first uncompleted pair in curated order. Null once every pair is done.
 */
export function nextComparison(
  profile: TasteProfile,
  comparisons: readonly TasteComparison[],
  priority: Record<TasteTrait, number> = GIFT_TRAIT_PRIORITY,
): TasteComparison | null {
  const remaining = comparisons.filter((comparison) => !profile.completedComparisonIds.includes(comparison.id));
  if (remaining.length === 0) return null;
  const unresolved = unresolvedTraits(profile, priority);
  const candidates = remaining.filter((comparison) => comparison.targetTraits.some((trait) => unresolved.includes(trait)));
  if (candidates.length === 0) return remaining[0]!;
  return candidates.reduce((best, comparison) => {
    const diff = pairValue(comparison, unresolved, priority) - pairValue(best, unresolved, priority);
    return diff > 0 || (diff === 0 && byStageThenId(comparison, best) < 0) ? comparison : best;
  });
}

export function progress(profile: TasteProfile, comparisons: readonly TasteComparison[]): { done: number; total: number } {
  const ids = new Set(comparisons.map((comparison) => comparison.id));
  return { done: profile.completedComparisonIds.filter((id) => ids.has(id)).length, total: comparisons.length };
}
