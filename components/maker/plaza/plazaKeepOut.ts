import type { Camera } from "three";
import { Vector3 } from "three";

// Where wandering characters should not stand: the strips of screen the Plaza's controls sit on.
// Goals are picked in world space, so each candidate is projected through the camera and checked
// against these screen regions (normalized device coordinates, -1..1). Purely a comfort rule for
// picking people: deliberate drags, line-ups, and the mission circle ignore it.

export interface KeepOutZone {
  /** Inclusive NDC bounds; omit a side to leave it open. */
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

/** The rails down both edges, the mission bar and hints along the bottom, and the exits top-left. */
export const PLAZA_KEEP_OUT: readonly KeepOutZone[] = [
  { xMax: -0.8 }, // left rail
  { xMin: 0.8 }, // right rail
  { yMax: -0.5, xMin: -0.62, xMax: 0.62 }, // mission bar / pick bar / hint bubble
  { xMax: -0.5, yMin: 0.78 }, // council exits, top-left
];

/** Height of a grown-up's head above the floor; a person whose head is in a zone still covers it. */
const HEAD_HEIGHT = 2.2;
const scratch = new Vector3();

function inZone(x: number, y: number, zone: KeepOutZone): boolean {
  if (zone.xMin !== undefined && x < zone.xMin) return false;
  if (zone.xMax !== undefined && x > zone.xMax) return false;
  if (zone.yMin !== undefined && y < zone.yMin) return false;
  if (zone.yMax !== undefined && y > zone.yMax) return false;
  return true;
}

/** True when a character standing at (x, z) would sit clear of every control on screen. */
export function clearOfControls(x: number, z: number, camera: Camera, zones: readonly KeepOutZone[] = PLAZA_KEEP_OUT): boolean {
  for (const y of [0, HEAD_HEIGHT]) {
    scratch.set(x, y, z).project(camera);
    if (Math.abs(scratch.x) > 1 || Math.abs(scratch.y) > 1) return false;
    for (const zone of zones) if (inZone(scratch.x, scratch.y, zone)) return false;
  }
  return true;
}
