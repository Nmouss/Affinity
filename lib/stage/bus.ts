import type { GestureEvent, GestureType } from "@/types/stage";

type GestureListener = (event: GestureEvent) => void;
type ArmingPolicy = (type: GestureType) => boolean;

const listeners = new Set<GestureListener>();
let armingPolicy: ArmingPolicy = () => true;

/** Delivers a gesture to every listener unless the current arming policy rejects it. */
export function emitGesture(event: GestureEvent): boolean {
  if (!armingPolicy(event.type)) return false;
  for (const listener of [...listeners]) listener(event);
  return true;
}

export function onGesture(listener: GestureListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The director installs the phase-based policy; the returned function restores the previous one. */
export function setArmingPolicy(policy: ArmingPolicy): () => void {
  const previous = armingPolicy;
  armingPolicy = policy;
  return () => {
    armingPolicy = previous;
  };
}

export function isArmed(type: GestureType): boolean {
  return armingPolicy(type);
}
