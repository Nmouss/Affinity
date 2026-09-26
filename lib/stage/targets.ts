import { Vector3, type Object3D } from "three";
import type { TargetId } from "@/types/stage";

export interface StageTarget {
  object: Object3D;
  /** Hit radius in world units (1 unit = 1 ft). */
  radius: number;
}

// Object3D refs live outside the zustand store so registering them never triggers React renders.
const targets = new Map<TargetId, StageTarget>();

/** Registers a pointable object; call the returned function on unmount. */
export function registerTarget(id: TargetId, object: Object3D, radius = 0.6): () => void {
  targets.set(id, { object, radius });
  return () => {
    if (targets.get(id)?.object === object) targets.delete(id);
  };
}

export function getTarget(id: TargetId): StageTarget | undefined {
  return targets.get(id);
}

export function listTargets(): Array<[TargetId, StageTarget]> {
  return [...targets.entries()];
}

export function getTargetWorldPosition(id: TargetId, out = new Vector3()): Vector3 | null {
  const target = targets.get(id);
  return target ? target.object.getWorldPosition(out) : null;
}
