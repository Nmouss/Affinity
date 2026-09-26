import { Plane, Raycaster, Vector2, Vector3, type Camera } from "three";
import type { MachineContext } from "@/lib/gestures/detector";
import { pickTarget, seatIndexOf, type ScreenTarget } from "@/lib/gestures/hitTest";
import { ROOM } from "@/lib/stage/layout";
import { listTargets } from "@/lib/stage/targets";

// Screen-space helpers shared by HandLayer and its visuals. Scratch objects are reused per call
// because these run every frame.

/** Hit areas are this much larger than the registered radius, since hands are imprecise. */
const HIT_GENEROSITY = 1.4;
/** Smallest hit radius on screen, in NDC y units. */
const MIN_HIT_RADIUS = 0.1;
/** Keeps dragged sprites off the walls. */
const WALL_MARGIN = 0.6;
/** A dropped sprite seats when the floor point is within this many seat radii. */
const SEAT_DROP_SLACK = 1.6;

const floor = new Plane(new Vector3(0, 1, 0), 0);
const raycaster = new Raycaster();
const ndc = new Vector2();
const world = new Vector3();
const edge = new Vector3();
const up = new Vector3();

export function projectTargets(camera: Camera, aspect: number): ScreenTarget[] {
  const out: ScreenTarget[] = [];
  up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  for (const [id, target] of listTargets()) {
    target.object.getWorldPosition(world);
    edge.copy(world).addScaledVector(up, target.radius).project(camera);
    world.project(camera);
    if (world.z > 1 || world.z < -1) continue;
    const radius = Math.hypot((edge.x - world.x) * aspect, edge.y - world.y);
    out.push({ id, ndc: [world.x, world.y], radius: Math.max(radius * HIT_GENEROSITY, MIN_HIT_RADIUS) });
  }
  return out;
}

/** Unit direction of the camera ray through an NDC point. */
export function pointerDirection(camera: Camera, pointer: [number, number], out: Vector3): Vector3 {
  raycaster.setFromCamera(ndc.set(pointer[0], pointer[1]), camera);
  return out.copy(raycaster.ray.direction);
}

/** Where the pointer ray meets the floor, clamped inside the room; null when it points above the horizon. */
export function floorPointAt(camera: Camera, pointer: [number, number], out: Vector3): Vector3 | null {
  raycaster.setFromCamera(ndc.set(pointer[0], pointer[1]), camera);
  if (!raycaster.ray.intersectPlane(floor, out)) return null;
  const halfWidth = ROOM.width / 2 - WALL_MARGIN;
  out.x = Math.min(halfWidth, Math.max(-halfWidth, out.x));
  out.z = Math.min(ROOM.depth / 2 - WALL_MARGIN, Math.max(ROOM.backWallZ + WALL_MARGIN, out.z));
  out.y = 0;
  return out;
}

export interface StageHitContext extends MachineContext {
  /** Call once per frame before stepping the machine; targets are projected lazily after it. */
  beginFrame(aspect: number): void;
}

/** Hit-testing against the targets registry, as seen through `camera`. */
export function createStageHitContext(camera: Camera): StageHitContext {
  let aspect = 1;
  let screenTargets: ScreenTarget[] | null = null;
  const floorPoint = new Vector3();
  const seatPoint = new Vector3();

  return {
    beginFrame(nextAspect) {
      aspect = nextAspect;
      screenTargets = null;
    },
    hitTest(pointer, accept) {
      screenTargets ??= projectTargets(camera, aspect);
      return pickTarget(pointer, screenTargets, aspect, accept);
    },
    dropSeat(pointer) {
      const floorHit = floorPointAt(camera, pointer, floorPoint);
      if (!floorHit) return null;
      let best: number | null = null;
      let bestDistance = Infinity;
      for (const [id, target] of listTargets()) {
        const seat = seatIndexOf(id);
        if (seat === null) continue;
        target.object.getWorldPosition(seatPoint);
        const distance = Math.hypot(seatPoint.x - floorHit.x, seatPoint.z - floorHit.z);
        if (distance <= target.radius * SEAT_DROP_SLACK && distance < bestDistance) {
          best = seat;
          bestDistance = distance;
        }
      }
      return best;
    },
  };
}
