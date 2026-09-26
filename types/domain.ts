export type MissionType = "shared" | "gift";
export type CatalogSlot = "tree" | "lights" | "ornaments" | "topper" | "decoy";

export interface HouseRule {
  type: "maxHeight" | "excludedTag";
  inches?: number;
  tag?: string;
  why: string;
}

export interface FamilyProfile {
  id: string;
  name: string;
  relationship: string;
  look: string;
  colors: string[];
  personality: string[];
  loves: string[];
  avoids: string[];
  houseRules: HouseRule[];
}

export interface Mission {
  occasion: string;
  budget: number;
  freeText: string;
  type: MissionType;
  recipientId?: string;
  invitedSpriteIds: string[];
}

export interface SpriteOpinion {
  spriteId: string;
  say: string;
  hardRules: HouseRule[];
  wishes: string[];
  vetoes: string[];
}

export interface ConstraintSet {
  hardRules: HouseRule[];
  wishes: Array<{ spriteId: string; wish: string; weight: number }>;
  conflicts: Array<{ rule: string; wish: string; resolution: string }>;
}

export interface CatalogItem {
  id: string;
  slot: CatalogSlot;
  name: string;
  price: number;
  heightIn?: number;
  tags: string[];
  model?: string;
  ornamentAnchors?: number;
}

export interface Bundle {
  items: CatalogItem[];
  total: number;
  serves: Record<string, string[]>;
}

export interface SpriteScore {
  spriteId: string;
  score: number;
  say: string;
  complaint?: string;
}

export interface CartMandate {
  mission: Mission;
  bundle: Bundle;
  approvedAt: string;
  publicKey: JsonWebKey;
  signature: string;
}

export type CouncilEvent =
  | { type: "opinion"; payload: SpriteOpinion }
  | { type: "constraints"; payload: ConstraintSet }
  | { type: "bundle"; payload: Bundle }
  | { type: "score"; payload: SpriteScore }
  | { type: "veto"; payload: ConstraintSet["conflicts"][number] }
  | { type: "awaiting_mandate"; payload: Bundle }
  | { type: "receipt"; payload: CartMandate };
