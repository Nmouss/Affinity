// Module-level pings (same pattern as turntable.ts / lib/gestures/live.ts) so DOM buttons outside
// the canvas can tell the editor's draft preview to act, without plumbing callbacks through every
// tab. EditorScene polls these timestamps once per frame in useFrame.

export const reactions = {
  /** performance.now() of the most recent option pick (a happy hop). */
  pickAt: -Infinity,
  /** performance.now() the save button was pressed (a celebration). */
  celebrateAt: -Infinity,
};

export function reactPick(): void {
  reactions.pickAt = performance.now();
}

export function reactCelebrate(): void {
  reactions.celebrateAt = performance.now();
}
