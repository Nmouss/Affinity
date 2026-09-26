import type { Recommendation } from "@/lib/mission/services/contracts";

// Fixed before/after results matching the Terminal 1 "Required demo result". Scores are fixtures,
// not computed here — the frontend never scores bundles.

export const recommendationBeforeJudge: Recommendation = {
  selectedBundleId: "premium",
  eligibleBundleIds: ["budget", "balanced", "premium"],
  rejectedBundles: [],
  individualScores: [
    { shopperId: "maya", bundleId: "budget", score: 72, reasons: ["Maya likes simple controls."] },
    { shopperId: "alex", bundleId: "budget", score: 48, reasons: ["Alex prefers durable gear."] },
    { shopperId: "maya", bundleId: "balanced", score: 82, reasons: ["Easy Press works one-handed."] },
    { shopperId: "alex", bundleId: "balanced", score: 76, reasons: ["Cast iron and aluminum hold up."] },
    { shopperId: "maya", bundleId: "premium", score: 88, reasons: ["Premium lantern is simple to use."] },
    { shopperId: "alex", bundleId: "premium", score: 93, reasons: ["Heirloom pieces match Alex's style."] },
  ],
  groupScores: { budget: 48, balanced: 76, premium: 88 },
  reasons: ["Premium gives Maya and Alex the highest combined result."],
};

export const recommendationAfterJudge: Recommendation = {
  selectedBundleId: "balanced",
  eligibleBundleIds: ["budget", "balanced"],
  rejectedBundles: [
    { bundleId: "premium", shopperId: "judge", violatedRequirement: "no_fragile_glass" },
  ],
  individualScores: [
    { shopperId: "maya", bundleId: "budget", score: 72, reasons: ["Maya likes simple controls."] },
    { shopperId: "alex", bundleId: "budget", score: 48, reasons: ["Alex prefers durable gear."] },
    { shopperId: "judge", bundleId: "budget", score: 54, reasons: ["Lower price, less durable."] },
    { shopperId: "maya", bundleId: "balanced", score: 82, reasons: ["Easy Press works one-handed."] },
    { shopperId: "alex", bundleId: "balanced", score: 76, reasons: ["Cast iron and aluminum hold up."] },
    { shopperId: "judge", bundleId: "balanced", score: 84, reasons: ["Matches your durability signal."] },
    { shopperId: "maya", bundleId: "premium", score: 88, reasons: ["Premium lantern is simple to use."] },
    { shopperId: "alex", bundleId: "premium", score: 93, reasons: ["Heirloom pieces match Alex's style."] },
  ],
  groupScores: { budget: 48, balanced: 76 },
  reasons: [
    "Your no-glass rule removed Premium.",
    "Your durability preference strengthened Balanced.",
    "Balanced gives the least-satisfied shopper the best remaining result.",
  ],
};

/** Returned when the guest joins without a rule (or skips onboarding): the judge doesn't change the pick. */
export const recommendationJudgeNoRule: Recommendation = {
  ...recommendationBeforeJudge,
  reasons: ["No new rules were added, so Premium still gives the group the best result."],
};
