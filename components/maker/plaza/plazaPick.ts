// Pure pointer math for the Plaza: NDC↔client-pixel conversion (so PlazaPointer can
// document.elementFromPoint under the pointer) and tap-vs-drag classification for a grab that
// started on a hovered person. Kept DOM- and three.js-free so it's unit-tested in vitest's node
// environment; PlazaPointer.tsx does the actual raycasting/elementFromPoint work.

/** NDC (x right, y up, both -1..1) to client pixel coordinates (x right, y down). Mirrors
 * components/hands/makerHitTest.ts's ndcToClient; kept as our own copy so the plaza scene doesn't
 * reach into the hands track's file. */
export function ndcToClientPx(ndc: readonly [number, number], width: number, height: number): [number, number] {
  const x = ((ndc[0] + 1) / 2) * width;
  const y = ((1 - ndc[1]) / 2) * height;
  return [x, y];
}

export function ndcDistance(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** A grab held at least this long becomes a drag even without moving. */
export const DRAG_HOLD_MS = 180;
/** A grab moved at least this far in NDC space (screen-relative, not pixels) becomes a drag even
 * before DRAG_HOLD_MS elapses. */
export const DRAG_MOVE_THRESHOLD = 0.035;

export type PressOutcome = "tap" | "drag";

/** Whether a still-active press should turn into a drag this frame: held past `holdMs`, or moved
 * past `moveThreshold` in NDC space. Call every frame while grabbing and not yet dragging. */
export function shouldStartDrag(
  elapsedMs: number,
  movedNdc: number,
  holdMs: number = DRAG_HOLD_MS,
  moveThreshold: number = DRAG_MOVE_THRESHOLD,
): boolean {
  return elapsedMs >= holdMs || movedNdc >= moveThreshold;
}

/**
 * Classifies a full press→release as a tap or a drag from its start/end time and NDC position.
 * Mirrors shouldStartDrag's thresholds, so a press released in a single instant (no intervening
 * frame to catch it) is still classified correctly.
 */
export function classifyPress(
  pressMs: number,
  releaseMs: number,
  startNdc: readonly [number, number],
  endNdc: readonly [number, number],
  holdMs: number = DRAG_HOLD_MS,
  moveThreshold: number = DRAG_MOVE_THRESHOLD,
): PressOutcome {
  return shouldStartDrag(releaseMs - pressMs, ndcDistance(startNdc, endNdc), holdMs, moveThreshold) ? "drag" : "tap";
}
