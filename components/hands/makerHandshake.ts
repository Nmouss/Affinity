import type { TargetId } from "@/types/stage";
import { uiTargetId } from "./makerHitTest";

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

/** MandateButton's data-hand-target value. */
export const MANDATE_HAND_TARGET = "mandate-approve";

/**
 * True while a Leap pinch is held over the enabled hold-to-approve button. MandateButton fills on a
 * held pointer, but MakerHands only turns a pinch into element.click() — so without this, pinching
 * the button did nothing and the only hand route to approval was the fist-roll handshake pose.
 * MakerHands feeds this into the "pinch" handshake assist, the hand's version of holding the mouse.
 */
export function pinchHoldsMandate(
  snapshot: { pinching: boolean; hover: TargetId | null },
  buttonEnabled: boolean,
): boolean {
  return buttonEnabled && snapshot.pinching && snapshot.hover === uiTargetId(MANDATE_HAND_TARGET);
}
