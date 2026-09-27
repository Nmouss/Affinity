import type { Vec3 } from "@/lib/stage/layout";

// Where gift pedestals stand: on the rug inside the council ring (center [0, 0, -2.5], radius 3.2,
// seats on the camera side), so the seated characters face the products and the camera sees both.
// Pure math, unit-tested.

/** Clear floor inside the ring: x within ±halfWidth of center, z within ±halfDepth. */
export const STAGE_FOOTPRINT = { center: [0, 0, -3.2] as Vec3, halfWidth: 3.6, halfDepth: 1.5 } as const;

/** Pedestal base radius in ft; two pedestals need at least twice this between centers. */
export const PEDESTAL_RADIUS = 0.65;

const ROW_GAP = 1.9;
const MAX_PER_ROW = 4;

/**
 * Floor positions for `count` pedestals, centered on the stage: one row up to four, then a second
 * row behind. Item order is preserved left to right, front row first.
 */
export function pedestalPositions(count: number): Vec3[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const [cx, cy, cz] = STAGE_FOOTPRINT.center;
  const rows = n <= MAX_PER_ROW ? 1 : 2;
  const perRow = Math.ceil(n / rows);
  const gap = Math.min(ROW_GAP, (2 * STAGE_FOOTPRINT.halfWidth) / Math.max(1, perRow));
  const rowZ = rows === 1 ? [cz] : [cz + STAGE_FOOTPRINT.halfDepth * 0.5, cz - STAGE_FOOTPRINT.halfDepth * 0.5];
  const positions: Vec3[] = [];
  for (let index = 0; index < n; index += 1) {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const column = index - row * perRow;
    const x = cx + (column - (inRow - 1) / 2) * gap;
    positions.push([x, cy, rowZ[row] ?? cz]);
  }
  return positions;
}

/** Height of a pedestal's top surface, where the product sits and the hand target centers. */
export const PEDESTAL_TOP_Y = 0.5;

/** The world point the inspect camera looks at for a pedestal at `position`. */
export function pedestalInspectTarget(position: Vec3): Vec3 {
  return [position[0], PEDESTAL_TOP_Y + 0.8, position[2]];
}
