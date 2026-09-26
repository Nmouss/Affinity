// Tiny cross-component channels between PlazaPointer and PlazaPerson that only need to be read
// once per frame by whichever single person they're relevant to right now. Kept outside zustand:
// routing them through usePlaza would re-render every person on every pointer move.

/** Where the pointer ray currently meets the floor plane (y = 0), updated every frame by
 * PlazaPointer. The dragged person damps toward this while held. */
export const plazaPointerFloor = { x: 0, z: 0 };

export type DragOutcome = "icon" | "floor";

let lastOutcome: { id: string; outcome: DragOutcome } | null = null;

/** PlazaPointer calls this the instant a drag ends (icon drop vs. released over open floor),
 * before it clears `draggingId` in the store. */
export function signalDragOutcome(id: string, outcome: DragOutcome): void {
  lastOutcome = { id, outcome };
}

/** The dragged person reads this once, the frame `draggingId` becomes null for them. */
export function consumeDragOutcome(id: string): DragOutcome | null {
  if (lastOutcome && lastOutcome.id === id) {
    const outcome = lastOutcome.outcome;
    lastOutcome = null;
    return outcome;
  }
  return null;
}
