// Shared room layout so the room and sprites tracks agree on where things are.
// 1 world unit = 1 ft. Floor is y = 0, the back wall is at z = ROOM.backWallZ, the camera looks toward -z.

export type Vec3 = [number, number, number];

export const ROOM = { width: 20, depth: 16, height: 9, backWallZ: -8, leftWallX: -10 } as const;

export const CAMERA = { position: [0, 7.5, 13] as Vec3, target: [0, 2, -3] as Vec3, fov: 42 } as const;

/** Fireplace base, centered on the back wall. */
export const HEARTH = { position: [0, 0, -7.4] as Vec3 } as const;

/** The rug in front of the hearth. Seats sit on the camera side of the ring. */
export const COUNCIL_RING = { center: [0, 0, -2.5] as Vec3, radius: 3.2, seatAngles: [-0.8, 0, 0.8] } as const;

/** Tree corner beside the fire, with the growth-chart ruler on the back wall behind it. */
export const TREE = { position: [-5.5, 0, -6] as Vec3 } as const;
export const RULER = { position: [-7.4, 0, -7.9] as Vec3 } as const;

/** Where each sprite waits in the lobby (Maya by the window, Ava at the toy shelf, Leo at the toy box). */
export const HOME_SPOTS: Record<string, Vec3> = {
  wife: [-7, 0, -1],
  daughter: [6.5, 0, -4],
  son: [7, 0, 1.5],
};

/** Height of a sprite's chest: its hand-tracking hit center and where ornaments launch from. */
export const SPRITE_FLOAT_HEIGHT = 1.1;

/** How many people a council can seat, and where people stand in the living room. */
export const MAX_SEATS = 6;

/** Family members' spots in the lobby, in roster order (the first three are the starters' HOME_SPOTS). */
export const HOME_SPOT_LIST: readonly Vec3[] = [
  [-7, 0, -1],
  [6.5, 0, -4],
  [7, 0, 1.5],
  [-5, 0, 1.5], // [-8, 0, 3] was left of the camera's view: a fourth family member stood off-screen
  [3.8, 0, -5.8],
  [-3.2, 0, -5.4],
];

/** Where friends arrive from and leave through when invited or sent home. */
export const DOORWAY: Vec3 = [9.5, 0, 6];

/** Where invited friends wait in the lobby before taking a seat. */
export const GUEST_SPOT_LIST: readonly Vec3[] = [
  [4.5, 0, 4.5],
  [-4.5, 0, 4.5],
  [2, 0, 5.5],
  [-2, 0, 5.5],
  [6, 0, 3],
  [-6, 0, 3],
];

export function homeSpot(index: number): Vec3 {
  return HOME_SPOT_LIST[index % HOME_SPOT_LIST.length]!;
}

export function guestSpot(index: number): Vec3 {
  return GUEST_SPOT_LIST[index % GUEST_SPOT_LIST.length]!;
}

/** Seat angles for a council of `count`, spread symmetrically; three seats match COUNCIL_RING.seatAngles. */
export function seatAngles(count: number): number[] {
  const n = Math.max(1, Math.min(MAX_SEATS, Math.floor(count)));
  if (n === 1) return [0];
  const span = Math.min(0.8 * (n - 1), 2.4);
  return Array.from({ length: n }, (_, index) => -span / 2 + (span * index) / (n - 1));
}

/** How many seats the ring shows: at least 3 (today's demo), growing with the party, capped at MAX_SEATS. */
export function activeSeatCount(seatedCount: number): number {
  return Math.min(MAX_SEATS, Math.max(3, Math.floor(seatedCount)));
}

/**
 * World position of seat `index` once `activeCount` seats are spread around the ring. Seat indices
 * stay put as people join or leave (nextFreeSeat always takes the lowest free one); only the spread
 * of the whole ring grows with `activeCount`. Defaults to 3 seats, so old callers (and the three
 * starters) get exactly today's positions.
 */
export function seatPosition(index: number, activeCount = 3): Vec3 {
  const angles = seatAngles(activeCount);
  const angle = angles[Math.min(Math.max(0, index), angles.length - 1)] ?? 0;
  const [cx, cy, cz] = COUNCIL_RING.center;
  return [cx + Math.sin(angle) * COUNCIL_RING.radius, cy, cz + Math.cos(angle) * COUNCIL_RING.radius];
}

export function homePosition(spriteId: string): Vec3 {
  return HOME_SPOTS[spriteId] ?? [0, 0, 4];
}
