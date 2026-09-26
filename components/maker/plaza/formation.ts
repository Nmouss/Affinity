import type { Circle } from "@/types/character";
import type { FamilyProfile } from "@/types/domain";
import type { WhistleSort } from "./plazaState";

// Plaza geometry and the whistle's line-ups. Pure, unit-tested.

/** The plaza floor is a disc of this radius (ft) centered on the origin; the camera looks at it from +z. */
export const PLAZA = { radius: 7 } as const;

/** Row/column geometry for the whistle formation, in world ft. */
export const FORMATION = {
  /** Horizontal spacing between people in the same row. */
  colSpacing: 1.4,
  /** Spacing between rows (rows step back in -z as the row index grows). */
  rowSpacing: 1.6,
  /** People per row before wrapping to the next one. */
  maxPerRow: 6,
  /** Gap ("circle" sort) between the family block's inner edge and the friends block's inner edge. */
  blockGap: 2,
} as const;

function compareName(a: FamilyProfile, b: FamilyProfile): number {
  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * People ids in the order the whistle lines them up: "name" is a plain case-insensitive A-Z sort
 * (ties broken by id, for a stable order when two people share a name); "circle" sorts family and
 * friends separately, each A-Z, family first.
 */
export function sortForWhistle(people: FamilyProfile[], circles: Record<string, Circle>, sort: WhistleSort): string[] {
  if (sort === "circle") {
    const family = people.filter((profile) => circles[profile.id] === "family").sort(compareName);
    const friends = people.filter((profile) => circles[profile.id] !== "family").sort(compareName);
    return [...family, ...friends].map((profile) => profile.id);
  }
  return [...people].sort(compareName).map((profile) => profile.id);
}

function rowCountFor(count: number): number {
  return Math.max(1, Math.ceil(count / FORMATION.maxPerRow));
}

/** Rows of `ids`, each row up to maxPerRow wide, centered on x = `centerX` and z-centered on 0,
 * with row 0 at the front (+z) stepping back (-z) as the row index grows. Writes into `out`. */
function layoutCenteredBlock(ids: string[], centerX: number, out: Record<string, [number, number]>): void {
  const rows = rowCountFor(ids.length);
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const remaining = ids.length - index;
    const count = Math.min(FORMATION.maxPerRow, remaining);
    const z = ((rows - 1) / 2 - row) * FORMATION.rowSpacing;
    const rowStartX = centerX - ((count - 1) / 2) * FORMATION.colSpacing;
    for (let col = 0; col < count; col += 1) {
      out[ids[index]!] = [rowStartX + col * FORMATION.colSpacing, z];
      index += 1;
    }
  }
}

/** Rows of `ids` anchored to `edgeX`, growing away from it (direction -1 grows more negative, for
 * the family block; +1 grows more positive, for the friends block). Writes into `out`. */
function layoutEdgeBlock(ids: string[], edgeX: number, direction: -1 | 1, out: Record<string, [number, number]>): void {
  const rows = rowCountFor(ids.length);
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const remaining = ids.length - index;
    const count = Math.min(FORMATION.maxPerRow, remaining);
    const z = ((rows - 1) / 2 - row) * FORMATION.rowSpacing;
    for (let col = 0; col < count; col += 1) {
      out[ids[index]!] = [edgeX + direction * col * FORMATION.colSpacing, z];
      index += 1;
    }
  }
}

/**
 * Floor spot [x, z] for each id in a whistle formation, rows facing the camera (+z). "name" is one
 * block of rows centered on the plaza; "circle" splits into a family block on the left (x < 0) and
 * a friends block on the right (x > 0), each block's inner edge FORMATION.blockGap/2 from center.
 */
export function formationSlots(
  orderedIds: string[],
  circles: Record<string, Circle>,
  sort: WhistleSort,
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (sort === "circle") {
    const familyIds = orderedIds.filter((id) => circles[id] === "family");
    const friendIds = orderedIds.filter((id) => circles[id] !== "family");
    layoutEdgeBlock(familyIds, -FORMATION.blockGap / 2, -1, out);
    layoutEdgeBlock(friendIds, FORMATION.blockGap / 2, 1, out);
  } else {
    layoutCenteredBlock(orderedIds, 0, out);
  }
  return out;
}
