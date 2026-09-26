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

export function seatPosition(index: number): Vec3 {
  const angle = COUNCIL_RING.seatAngles[index] ?? 0;
  const [cx, cy, cz] = COUNCIL_RING.center;
  return [cx + Math.sin(angle) * COUNCIL_RING.radius, cy, cz + Math.cos(angle) * COUNCIL_RING.radius];
}

export function homePosition(spriteId: string): Vec3 {
  return HOME_SPOTS[spriteId] ?? [0, 0, 4];
}
