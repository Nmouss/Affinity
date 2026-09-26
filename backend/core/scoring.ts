import type {
  Bundle,
  IndividualScore,
  Product,
  Recommendation,
  RejectedBundle,
  ShopperProfile,
} from "@/shared/types";
import { isTasteAxis } from "./taste";

export function normalizeAffinity(raw: number): number {
  if (!Number.isFinite(raw)) return 0.5;
  return Math.max(0, Math.min(1, (raw + 1) / 2));
}

function affinityFromAttributes(shopper: ShopperProfile, attributes: Record<string, number>): number {
  let total = 0;
  let evidenceTotal = 0;

  for (const [axis, preference] of Object.entries(shopper.preferences)) {
    if (!isTasteAxis(axis)) continue;
    const evidence = shopper.evidenceCounts[axis] ?? 0;
    const attribute = attributes[axis];
    if (evidence <= 0 || attribute === undefined) continue;
    total += preference * attribute * evidence;
    evidenceTotal += evidence;
  }

  return evidenceTotal === 0 ? 0.5 : normalizeAffinity(total / evidenceTotal);
}

export function itemAffinity(shopper: ShopperProfile, product: Product): number {
  if (shopper.category !== product.category) return 0.5;
  return affinityFromAttributes(shopper, product.attributes);
}

export function bundleAffinity(shopper: ShopperProfile, bundle: Bundle): number {
  return affinityFromAttributes(shopper, bundle.attributes);
}

export function groupScore(scores: number[], valueScore: number): number {
  if (scores.length === 0) throw new Error("groupScore requires at least one shopper score");
  const boundedScores = scores.map((score) =>
    Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.5,
  );
  const minimum = Math.min(...boundedScores);
  const average = boundedScores.reduce((sum, value) => sum + value, 0) / boundedScores.length;
  const boundedValue = Number.isFinite(valueScore) ? Math.max(0, Math.min(1, valueScore)) : 0.5;
  const score = Math.max(0, Math.min(1, 0.6 * minimum + 0.3 * average + 0.1 * boundedValue));
  return Math.round(score * 1_000_000) / 1_000_000;
}

export function bundleViolations(bundle: Bundle, shoppers: ShopperProfile[]): RejectedBundle[] {
  const violations: RejectedBundle[] = [];
  for (const shopper of shoppers) {
    for (const requirement of [...shopper.rules, ...shopper.confirmedUseRequirements]) {
      if (bundle.satisfies[requirement] !== true) {
        violations.push({ bundleId: bundle.id, shopperId: shopper.id, violatedRequirement: requirement });
      }
    }
  }
  return violations;
}

export function isEligible(bundle: Bundle, shoppers: ShopperProfile[]): boolean {
  return bundleViolations(bundle, shoppers).length === 0;
}

function affinityReasons(shopper: ShopperProfile, bundle: Bundle): string[] {
  const contributions = Object.entries(shopper.preferences)
    .filter(([axis]) => isTasteAxis(axis))
    .map(([axis, preference]) => ({
      axis,
      evidence: shopper.evidenceCounts[axis] ?? 0,
      contribution: preference * (bundle.attributes[axis] ?? 0) * (shopper.evidenceCounts[axis] ?? 0),
    }))
    .filter(({ evidence }) => evidence > 0)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || a.axis.localeCompare(b.axis));

  if (contributions.length === 0) return ["No confirmed taste evidence; neutral affinity applied."];
  return contributions.slice(0, 2).map(({ axis, contribution }) =>
    contribution >= 0
      ? `${bundle.name} aligns with ${shopper.name}'s ${axis} evidence.`
      : `${bundle.name} conflicts with ${shopper.name}'s ${axis} evidence.`,
  );
}

export function scoreIndividual(shopper: ShopperProfile, bundle: Bundle): IndividualScore {
  return {
    shopperId: shopper.id,
    bundleId: bundle.id,
    score: bundleAffinity(shopper, bundle),
    reasons: affinityReasons(shopper, bundle),
  };
}

export function recommendBundles(bundles: Bundle[], shoppers: ShopperProfile[]): Recommendation {
  if (shoppers.length === 0) throw new Error("At least one shopper is required for recommendation");
  const uniqueShoppers = [...new Map(shoppers.map((shopper) => [shopper.id, shopper])).values()];

  const rejectedBundles = bundles.flatMap((bundle) => bundleViolations(bundle, uniqueShoppers));
  const eligibleBundles = bundles.filter((bundle) => !rejectedBundles.some((rejected) => rejected.bundleId === bundle.id));
  if (eligibleBundles.length === 0) throw new Error("No eligible bundles satisfy every rule and confirmed requirement");

  const individualScores = eligibleBundles.flatMap((bundle) =>
    uniqueShoppers.map((shopper) => scoreIndividual(shopper, bundle)),
  );
  const groupScores = Object.fromEntries(
    eligibleBundles.map((bundle) => {
      const scores = individualScores.filter((score) => score.bundleId === bundle.id).map((score) => score.score);
      return [bundle.id, groupScore(scores, bundle.valueScore)];
    }),
  );
  const selected = [...eligibleBundles].sort(
    (left, right) => groupScores[right.id]! - groupScores[left.id]! || left.id.localeCompare(right.id),
  )[0]!;
  const selectedScores = individualScores.filter((score) => score.bundleId === selected.id).map((score) => score.score);
  const minimum = Math.min(...selectedScores);

  const reasons = [
    ...rejectedBundles.map(
      (rejected) =>
        `${rejected.bundleId} is ineligible because ${rejected.shopperId} requires ${rejected.violatedRequirement}.`,
    ),
    `${selected.name} has the strongest fairness score with a lowest-member satisfaction of ${minimum.toFixed(3)}.`,
  ];

  return {
    selectedBundleId: selected.id,
    eligibleBundleIds: eligibleBundles.map((bundle) => bundle.id),
    rejectedBundles,
    individualScores,
    groupScores,
    reasons,
  };
}
