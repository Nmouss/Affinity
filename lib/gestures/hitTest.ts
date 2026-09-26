import type { TargetId } from "@/types/stage";

/** A target projected to the screen. */
export interface ScreenTarget {
  id: TargetId;
  ndc: [number, number];
  /** Hit radius in NDC y units (so it is the same size on screen both ways once x is aspect-corrected). */
  radius: number;
}

/**
 * The target nearest the pointer, measured relative to each target's radius, among those whose
 * radius contains it. Distances use x scaled by the aspect ratio so hit areas stay round on screen.
 */
export function pickTarget(
  pointer: [number, number],
  targets: Iterable<ScreenTarget>,
  aspect: number,
  accept?: (id: TargetId) => boolean,
): TargetId | null {
  let best: TargetId | null = null;
  let bestScore = Infinity;
  for (const target of targets) {
    if (accept && !accept(target.id)) continue;
    const dx = (target.ndc[0] - pointer[0]) * aspect;
    const dy = target.ndc[1] - pointer[1];
    const distance = Math.hypot(dx, dy);
    if (target.radius <= 0 || distance > target.radius) continue;
    const score = distance / target.radius;
    if (score < bestScore) {
      bestScore = score;
      best = target.id;
    }
  }
  return best;
}

export function spriteIdOf(target: TargetId | null): string | null {
  return target?.startsWith("sprite:") ? target.slice("sprite:".length) : null;
}

export function itemIdOf(target: TargetId | null): string | null {
  return target?.startsWith("item:") ? target.slice("item:".length) : null;
}

export function seatIndexOf(target: TargetId | null): number | null {
  if (!target?.startsWith("seat:")) return null;
  const index = Number(target.slice("seat:".length));
  return Number.isInteger(index) ? index : null;
}
