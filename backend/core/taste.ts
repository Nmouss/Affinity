import type { ComparisonChoice, ComparisonPair, ShopperProfile, TasteAxis } from "@/shared/types";

export const TASTE_AXES: readonly TasteAxis[] = [
  "durability",
  "compactness",
  "simpleControls",
  "expressiveStyle",
];

const TASTE_AXIS_SET = new Set<string>(TASTE_AXES);

export function isTasteAxis(value: string): value is TasteAxis {
  return TASTE_AXIS_SET.has(value);
}

export function createShopperProfile(input: {
  id: string;
  name: string;
  avatarId: string;
  category: string;
  rules?: string[];
}): ShopperProfile {
  return {
    id: input.id,
    name: input.name,
    avatarId: input.avatarId,
    category: input.category,
    preferences: Object.fromEntries(TASTE_AXES.map((axis) => [axis, 0])),
    evidenceCounts: Object.fromEntries(TASTE_AXES.map((axis) => [axis, 0])),
    rules: [...(input.rules ?? [])],
    preferredUseTraits: [],
    confirmedUseRequirements: [],
  };
}

export function applyComparison(
  profile: ShopperProfile,
  pair: ComparisonPair,
  choice: ComparisonChoice,
): ShopperProfile {
  if (choice === "skip" || choice === "neither") return structuredClone(profile);

  const value = choice === "left" ? pair.leftValue : pair.rightValue;
  return {
    ...profile,
    preferences: {
      ...profile.preferences,
      [pair.axis]: (profile.preferences[pair.axis] ?? 0) + value,
    },
    evidenceCounts: {
      ...profile.evidenceCounts,
      [pair.axis]: (profile.evidenceCounts[pair.axis] ?? 0) + 1,
    },
    rules: [...profile.rules],
    preferredUseTraits: [...profile.preferredUseTraits],
    confirmedUseRequirements: [...profile.confirmedUseRequirements],
  };
}

export function addRule(profile: ShopperProfile, rule: string): ShopperProfile {
  if (profile.rules.includes(rule)) return structuredClone(profile);
  return { ...profile, rules: [...profile.rules, rule] };
}
