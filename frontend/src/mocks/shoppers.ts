import type { ShopperProfile } from "../services/contracts";

const axes = () => ({ durability: 0, compactness: 0, simpleControls: 0, expressiveStyle: 0 });

export const existingShoppers: ShopperProfile[] = [
  {
    id: "jonathan",
    name: "Jonathan",
    avatarId: "avatar_01",
    category: "cabin_supplies",
    preferences: { durability: 1, compactness: 0, simpleControls: 1, expressiveStyle: 0 },
    evidenceCounts: { durability: 2, compactness: 0, simpleControls: 1, expressiveStyle: 0 },
    rules: [],
    preferredUseTraits: [],
    confirmedUseRequirements: [],
  },
  {
    id: "maya",
    name: "Maya",
    avatarId: "avatar_02",
    category: "cabin_supplies",
    preferences: { durability: 1, compactness: 1, simpleControls: 2, expressiveStyle: -1 },
    evidenceCounts: { durability: 2, compactness: 1, simpleControls: 2, expressiveStyle: 1 },
    rules: [],
    preferredUseTraits: [],
    confirmedUseRequirements: ["one_hand_operation"],
  },
  {
    id: "alex",
    name: "Alex",
    avatarId: "avatar_04",
    category: "cabin_supplies",
    preferences: { durability: 2, compactness: -1, simpleControls: 0, expressiveStyle: 1 },
    evidenceCounts: { durability: 2, compactness: 1, simpleControls: 0, expressiveStyle: 1 },
    rules: [],
    preferredUseTraits: [],
    confirmedUseRequirements: [],
  },
];

export function blankShopper(id: string, name: string, avatarId: string, rule: string | null): ShopperProfile {
  return {
    id,
    name,
    avatarId,
    category: "cabin_supplies",
    preferences: axes(),
    evidenceCounts: axes(),
    rules: rule ? [rule] : [],
    preferredUseTraits: [],
    confirmedUseRequirements: [],
  };
}
