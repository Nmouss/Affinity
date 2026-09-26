import type { Bundle } from "@/types/domain";

// Pure anchor math shared by the procedural tree and the ornament flights.

export const ANCHOR_COUNT = 12;

/** Anchor node name in tree GLBs (1-based, zero-padded: ornament_01 … ornament_12). */
export function anchorName(anchor: number): string {
  return `ornament_${String(anchor).padStart(2, "0")}`;
}

export interface AnchorAssignment {
  itemId: string;
  /** Sprite the set serves, from bundle.serves; null when no sprite claims it. */
  spriteId: string | null;
  /** 1-based anchor number, matching ornament_01 … ornament_12 and the anchor:<n> targets. */
  anchor: number;
  /** Flight order across all sets, used for the stagger. */
  order: number;
}

export function servingSprite(serves: Bundle["serves"], itemId: string): string | null {
  for (const [spriteId, itemIds] of Object.entries(serves)) {
    if (itemIds.includes(itemId)) return spriteId;
  }
  return null;
}

/**
 * Slot order for the ornament sets. When the set count is unchanged, sets kept from the previous
 * bundle keep their slot and new sets take the vacated ones, so a revised bundle only re-flies
 * the sets that changed.
 */
function slotOrder(itemIds: string[], previous: AnchorAssignment[] | undefined): string[] {
  if (!previous || previous.length === 0) return itemIds;
  const previousSlots: string[] = [];
  for (const assignment of [...previous].sort((a, b) => a.anchor - b.anchor)) {
    if (!previousSlots.includes(assignment.itemId)) previousSlots.push(assignment.itemId);
  }
  if (previousSlots.length !== itemIds.length) return itemIds;
  const incoming = itemIds.filter((id) => !previousSlots.includes(id));
  return previousSlots.map((id) => (itemIds.includes(id) ? id : (incoming.shift() as string)));
}

/**
 * Splits the anchors across the bundle's ornament sets round-robin (anchor n goes to set
 * (n - 1) mod sets), so every set spreads around the tree and flights alternate between sprites.
 */
export function allocateAnchors(
  bundle: Pick<Bundle, "items" | "serves">,
  anchorCount = ANCHOR_COUNT,
  previous?: AnchorAssignment[],
): AnchorAssignment[] {
  const itemIds = bundle.items.filter((item) => item.slot === "ornaments").map((item) => item.id);
  if (itemIds.length === 0) return [];
  const slots = slotOrder(itemIds, previous);
  const assignments: AnchorAssignment[] = [];
  for (let anchor = 1; anchor <= anchorCount; anchor += 1) {
    const itemId = slots[(anchor - 1) % slots.length];
    assignments.push({ itemId, spriteId: servingSprite(bundle.serves, itemId), anchor, order: anchor - 1 });
  }
  return assignments;
}

export interface TreeProfile {
  /** Where foliage starts and ends, in ft above the floor. */
  foliageBottom: number;
  foliageTop: number;
  /** Foliage radius at the bottom, in ft. */
  baseRadius: number;
  potHeight: number;
}

/** Proportions of the procedural tree for a given total height (tip included). */
export function treeProfile(heightFt: number): TreeProfile {
  return {
    potHeight: heightFt * 0.13,
    foliageBottom: heightFt * 0.17,
    foliageTop: heightFt * 0.93,
    baseRadius: heightFt * 0.34,
  };
}

/** Silhouette radius at height y, treating the tiers as one cone. */
export function foliageRadiusAt(profile: TreeProfile, y: number): number {
  const t = (y - profile.foliageBottom) / (profile.foliageTop - profile.foliageBottom);
  return profile.baseRadius * Math.min(1, Math.max(0, 1 - t));
}

export interface TreeTier {
  bottom: number;
  top: number;
  radius: number;
}

const TIER_COUNT = 4;

/** Overlapping cone tiers whose flared skirts give the procedural tree its layered silhouette. */
export function treeTiers(heightFt: number): TreeTier[] {
  const profile = treeProfile(heightFt);
  const span = profile.foliageTop - profile.foliageBottom;
  return Array.from({ length: TIER_COUNT }, (_, index) => {
    const bottom = profile.foliageBottom + span * index * 0.2;
    const top = profile.foliageBottom + span * (0.42 + (index * 0.58) / (TIER_COUNT - 1));
    const radius = index === 0 ? profile.baseRadius : foliageRadiusAt(profile, bottom) * 1.18;
    return { bottom, top, radius };
  });
}

/** Outer radius of the tiered foliage at height y (0 above the tip). */
export function surfaceRadiusAt(tiers: TreeTier[], y: number): number {
  let radius = 0;
  for (const tier of tiers) {
    if (y < tier.bottom || y > tier.top) continue;
    radius = Math.max(radius, (tier.radius * (tier.top - y)) / (tier.top - tier.bottom));
  }
  return radius;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Angle that faces the room from the tree corner, so the first anchors and bulbs read on camera. */
const FRONT_ANGLE = 0.6;

/**
 * Anchor positions on the procedural tree's surface, in tree-local ft. A golden-angle spiral from
 * bottom to top, starting on the side that faces the room.
 */
export function proceduralAnchorPositions(heightFt: number, count = ANCHOR_COUNT): Array<[number, number, number]> {
  const profile = treeProfile(heightFt);
  const tiers = treeTiers(heightFt);
  const span = profile.foliageTop - profile.foliageBottom;
  const low = profile.foliageBottom + span * 0.12;
  const high = profile.foliageBottom + span * 0.74;
  return Array.from({ length: count }, (_, index) => {
    const y = count === 1 ? low : low + ((high - low) * index) / (count - 1);
    const radius = surfaceRadiusAt(tiers, y) * 0.96;
    const angle = FRONT_ANGLE + index * GOLDEN_ANGLE;
    return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
  });
}

/** Bulb positions: a garland spiral wrapping the foliage a few times, in tree-local ft. */
export function bulbPositions(heightFt: number, count: number, turns = 6): Array<[number, number, number]> {
  const profile = treeProfile(heightFt);
  const tiers = treeTiers(heightFt);
  const span = profile.foliageTop - profile.foliageBottom;
  return Array.from({ length: count }, (_, index) => {
    const f = index / Math.max(1, count - 1);
    const y = profile.foliageBottom + span * (0.04 + 0.86 * f);
    const radius = surfaceRadiusAt(tiers, y) * 0.93 + 0.02;
    const angle = FRONT_ANGLE + f * turns * Math.PI * 2;
    return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
  });
}
