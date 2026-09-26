import type { TargetId } from "@/types/stage";

// Pure math for MakerHands: NDC → client pixels (so it can document.elementFromPoint) and the
// `ui:` target-id convention for DOM controls. Kept DOM-free on purpose so it's unit-testable in
// vitest's node environment; MakerHands.tsx does the actual document.elementFromPoint/closest walk.

/** NDC (x right, y up, both -1..1) to client pixel coordinates (x right, y down). */
export function ndcToClient(pointer: readonly [number, number], width: number, height: number): [number, number] {
  const x = ((pointer[0] + 1) / 2) * width;
  const y = ((1 - pointer[1]) / 2) * height;
  return [x, y];
}

export const HAND_TARGET_ATTR = "data-hand-target";
export const HAND_HOVER_ATTR = "data-hand-hover";

/** Wraps a `data-hand-target` value into the TargetId the gesture machine speaks. */
export function uiTargetId(value: string): TargetId {
  return `ui:${value}`;
}

/** Inverse of uiTargetId; null for anything that isn't a `ui:` target. */
export function uiTargetValue(target: TargetId | null): string | null {
  return target?.startsWith("ui:") ? target.slice("ui:".length) : null;
}
