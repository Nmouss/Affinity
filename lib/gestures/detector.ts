import { emitGesture } from "@/lib/stage/bus";
import type { GestureEvent, TargetId } from "@/types/stage";
import { itemIdOf, spriteIdOf } from "./hitTest";

// Turns per-frame hand readings into the semantic GestureEvents in types/stage.ts. It knows nothing
// about phases: the director's arming policy on the bus decides which events mean something.

export const GESTURE_CONFIG = {
  /** A pinch starts above pinchOn (with an open-enough hand) and releases below pinchOff. */
  pinchOn: 0.8,
  pinchOff: 0.6,
  /** A fist also reads as a strong pinch, so a pinch needs grab below this. */
  pinchMaxGrab: 0.5,
  /** Closing into a fist mid-pinch cancels the pinch instead of tapping. */
  pinchCancelGrab: 0.85,
  tapMs: 400,
  /** Pointer travel, as a fraction of the screen, that turns a sprite pinch into a drag. */
  dragMoveFraction: 0.03,
  openMaxGrab: 0.2,
  openMaxPinch: 0.3,
  /** NDC per frame below which open-palm motion is treated as jitter. */
  orbitDeadzone: 0.001,
  handshakeMinRollDeg: 60,
  handshakeMaxRollDeg: 120,
  handshakeMinGrab: 0.9,
  /** Once a handshake is held, small wobbles past the thresholds don't break it. */
  handshakeRollSlackDeg: 5,
  handshakeGrabSlack: 0.05,
  handshakeFillMs: 1500,
  handshakeDrainRate: 2,
  handshakeEmitStep: 0.02,
  /** mm/s of palm x velocity. */
  swipeSpeed: 1000,
  swipeCooldownMs: 600,
  /** A fast swipe can leave the item before the speed peaks, so recent item hovers still count. */
  swipeHoverGraceMs: 250,
  /** Longer gaps between steps (a background tab) are clamped so timers don't jump. */
  maxStepMs: 100,
  /** Palm-up (roll ≈ ±180°) with an open hand is the talk pose. */
  talkMinRollDeg: 150,
  /** How long the pose must be held before talkStart fires. */
  talkHoldMs: 250,
  /** How long the pose must be absent before talkEnd fires (hand dropout ends it immediately instead). */
  talkReleaseMs: 350,
};

export type GestureConfig = typeof GESTURE_CONFIG;

/** One reading of the tracked hand, already mapped to the screen. */
export interface MachineHand {
  /** Smoothed pointer in NDC. */
  pointer: [number, number];
  pinch: number;
  grab: number;
  rollRadians: number;
  /** Palm x velocity in mm/s. */
  velocityX: number;
}

export interface MachineContext {
  /** The target under the pointer, skipping any the filter rejects. */
  hitTest(pointer: [number, number], accept?: (id: TargetId) => boolean): TargetId | null;
  /** The ring seat a sprite dropped at this pointer would land in, or null. */
  dropSeat(pointer: [number, number]): number | null;
}

export interface MachineInput {
  /** Milliseconds, monotonic. */
  t: number;
  hand: MachineHand | null;
  /** A handshake held by another source (Space, the approve button). */
  handshakeAssist?: boolean;
}

export interface MachineSnapshot {
  hover: TargetId | null;
  pinching: boolean;
  draggingSpriteId: string | null;
  handshakeProgress: number;
  handshakeHeld: boolean;
  talking: boolean;
}

export interface GestureMachine {
  step(input: MachineInput, context: MachineContext): MachineSnapshot;
  snapshot(): MachineSnapshot;
  /** Forgets everything without emitting (R reset). */
  reset(): void;
}

interface PinchState {
  startedAt: number;
  startPointer: [number, number];
  target: TargetId | null;
  dragSpriteId: string | null;
}

const DEG = 180 / Math.PI;

export function isPinchStart(pinch: number, grab: number, config: GestureConfig = GESTURE_CONFIG): boolean {
  return pinch > config.pinchOn && grab < config.pinchMaxGrab;
}

export function isOpenPalm(pinch: number, grab: number, config: GestureConfig = GESTURE_CONFIG): boolean {
  return grab < config.openMaxGrab && pinch < config.openMaxPinch;
}

/** Palm facing up, open hand: push-to-talk. Distinct from orbit (palm down) and the handshake (sideways). */
export function isTalkPose(
  rollRadians: number,
  pinch: number,
  grab: number,
  config: GestureConfig = GESTURE_CONFIG,
): boolean {
  const roll = Math.abs(rollRadians * DEG);
  return roll >= config.talkMinRollDeg && isOpenPalm(pinch, grab, config);
}

export function isHandshakePose(
  rollRadians: number,
  grab: number,
  held = false,
  config: GestureConfig = GESTURE_CONFIG,
): boolean {
  const roll = Math.abs(rollRadians * DEG);
  const rollSlack = held ? config.handshakeRollSlackDeg : 0;
  const grabSlack = held ? config.handshakeGrabSlack : 0;
  return (
    roll >= config.handshakeMinRollDeg - rollSlack &&
    roll <= config.handshakeMaxRollDeg + rollSlack &&
    grab > config.handshakeMinGrab - grabSlack
  );
}

export function createGestureMachine(
  options: { emit?: (event: GestureEvent) => void; config?: Partial<GestureConfig> } = {},
): GestureMachine {
  const emit = options.emit ?? emitGesture;
  const config: GestureConfig = { ...GESTURE_CONFIG, ...options.config };

  let lastT: number | null = null;
  let hover: TargetId | null = null;
  let pinch: PinchState | null = null;
  let orbitFrom: [number, number] | null = null;
  let lastItemHover: { id: string; t: number } | null = null;
  let lastSwipeAt = -Infinity;
  let progress = 0;
  let emittedProgress = 0;
  let handshakeHeld = false;
  let completed = false;
  let talking = false;
  let talkPoseHeldMs = 0;
  let talkAbsentMs = 0;

  const snapshot = (): MachineSnapshot => ({
    hover,
    pinching: pinch !== null,
    draggingSpriteId: pinch?.dragSpriteId ?? null,
    handshakeProgress: progress,
    handshakeHeld,
    talking,
  });

  const setHover = (next: TargetId | null) => {
    if (next === hover) return;
    hover = next;
    emit({ type: "hover", target: next });
  };

  const endPinch = (hand: MachineHand | null, t: number, context: MachineContext, cancelled: boolean) => {
    const current = pinch;
    pinch = null;
    if (!current) return;
    if (current.dragSpriteId) {
      const seat = hand && !cancelled ? context.dropSeat(hand.pointer) : null;
      emit({ type: "dragEnd", spriteId: current.dragSpriteId, seat });
      return;
    }
    if (cancelled || t - current.startedAt > config.tapMs) return;
    const target = current.target ?? hover;
    if (target) emit({ type: "pinchTap", target });
  };

  const updatePinch = (hand: MachineHand, t: number, context: MachineContext) => {
    if (!pinch) {
      if (!isPinchStart(hand.pinch, hand.grab, config)) return;
      pinch = { startedAt: t, startPointer: hand.pointer, target: hover, dragSpriteId: null };
      return;
    }
    if (hand.grab > config.pinchCancelGrab) {
      endPinch(hand, t, context, true);
      return;
    }
    if (hand.pinch < config.pinchOff) {
      endPinch(hand, t, context, false);
      return;
    }
    const spriteId = spriteIdOf(pinch.target);
    if (!pinch.dragSpriteId && spriteId) {
      const moved =
        Math.hypot(hand.pointer[0] - pinch.startPointer[0], hand.pointer[1] - pinch.startPointer[1]) / 2;
      if (t - pinch.startedAt > config.tapMs || moved > config.dragMoveFraction) {
        pinch.dragSpriteId = spriteId;
        emit({ type: "dragStart", spriteId });
      }
    }
  };

  const updateOpenPalm = (hand: MachineHand, t: number) => {
    if (pinch || !isOpenPalm(hand.pinch, hand.grab, config)) {
      orbitFrom = null;
      return;
    }
    if (orbitFrom) {
      const dx = hand.pointer[0] - orbitFrom[0];
      const dy = hand.pointer[1] - orbitFrom[1];
      if (Math.hypot(dx, dy) > config.orbitDeadzone) emit({ type: "orbit", dx, dy });
    }
    orbitFrom = hand.pointer;

    const recentItem = lastItemHover && t - lastItemHover.t <= config.swipeHoverGraceMs ? lastItemHover.id : null;
    if (
      recentItem &&
      Math.abs(hand.velocityX) > config.swipeSpeed &&
      t - lastSwipeAt > config.swipeCooldownMs
    ) {
      lastSwipeAt = t;
      lastItemHover = null;
      emit({ type: "swipe", itemId: recentItem });
    }
  };

  const updateHandshake = (posing: boolean, dtMs: number) => {
    const wasHeld = handshakeHeld;
    handshakeHeld = posing;
    if (posing) {
      if (!completed) progress = Math.min(1, progress + dtMs / config.handshakeFillMs);
    } else if (wasHeld && completed) {
      // A finished shake starts the next one from empty, so each hold completes at most once.
      progress = 0;
      completed = false;
    } else {
      progress = Math.max(0, progress - (dtMs * config.handshakeDrainRate) / config.handshakeFillMs);
      if (progress === 0) completed = false;
    }

    const atEnd = (progress === 0 || progress === 1) && progress !== emittedProgress;
    if (atEnd || Math.abs(progress - emittedProgress) > config.handshakeEmitStep) {
      emittedProgress = progress;
      emit({ type: "handshakeProgress", progress });
    }
    if (progress >= 1 && !completed) {
      completed = true;
      emit({ type: "handshakeComplete" });
    }
  };

  /** Hand is gone: forget the pose immediately, and end a talk in progress right away (no release timer). */
  const dropTalk = () => {
    talkPoseHeldMs = 0;
    talkAbsentMs = 0;
    if (!talking) return;
    talking = false;
    emit({ type: "talkEnd" });
  };

  const updateTalk = (posing: boolean, dtMs: number) => {
    if (posing) {
      talkAbsentMs = 0;
      if (talking) return;
      talkPoseHeldMs += dtMs;
      if (talkPoseHeldMs >= config.talkHoldMs) {
        talkPoseHeldMs = 0;
        talking = true;
        emit({ type: "talkStart" });
      }
      return;
    }
    talkPoseHeldMs = 0;
    if (!talking) return;
    talkAbsentMs += dtMs;
    if (talkAbsentMs >= config.talkReleaseMs) {
      talkAbsentMs = 0;
      talking = false;
      emit({ type: "talkEnd" });
    }
  };

  return {
    snapshot,

    reset() {
      lastT = null;
      hover = null;
      pinch = null;
      orbitFrom = null;
      lastItemHover = null;
      lastSwipeAt = -Infinity;
      progress = 0;
      emittedProgress = 0;
      handshakeHeld = false;
      completed = false;
      talking = false;
      talkPoseHeldMs = 0;
      talkAbsentMs = 0;
    },

    step({ t, hand, handshakeAssist = false }, context) {
      const dtMs = lastT === null ? 0 : Math.min(config.maxStepMs, Math.max(0, t - lastT));
      lastT = t;

      if (!hand) {
        endPinch(null, t, context, true);
        orbitFrom = null;
        setHover(null);
        updateHandshake(handshakeAssist, dtMs);
        dropTalk();
        return snapshot();
      }

      const dragging = pinch?.dragSpriteId ? `sprite:${pinch.dragSpriteId}` : null;
      setHover(context.hitTest(hand.pointer, dragging ? (id) => id !== dragging : undefined));
      const itemId = itemIdOf(hover);
      if (itemId) lastItemHover = { id: itemId, t };

      updatePinch(hand, t, context);
      updateOpenPalm(hand, t);
      const posing = isHandshakePose(hand.rollRadians, hand.grab, handshakeHeld, config);
      updateHandshake(posing || handshakeAssist, dtMs);
      updateTalk(isTalkPose(hand.rollRadians, hand.pinch, hand.grab, config), dtMs);
      return snapshot();
    },
  };
}
