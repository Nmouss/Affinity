// Pure change predicate for MakerHands' per-frame handshakeProgress write (BUG 2: nothing wrote
// hand.handshakeProgress on `/`, so MandateButton's fill never moved). Kept separate from the
// component so it's unit-testable without mounting anything.

/** Below this delta a handshakeProgress change is noise; matches the detector's own emit-step
 * order of magnitude (GESTURE_CONFIG.handshakeEmitStep is 0.02) but a little tighter, since this
 * gate only decides whether to touch the store, not whether to emit a bus event. */
export const HANDSHAKE_PROGRESS_EPSILON = 0.005;

/** True when `next` has moved far enough from `previous` to be worth writing to the store. */
export function handshakeProgressChanged(
  previous: number,
  next: number,
  epsilon: number = HANDSHAKE_PROGRESS_EPSILON,
): boolean {
  return Math.abs(next - previous) > epsilon;
}
