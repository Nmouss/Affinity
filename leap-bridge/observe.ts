// Turns a sequence of CompactFrames into a BOUNDED "use observation": simple, deterministic facts
// about which hand(s) were used and roughly how, derived only from palm/grab/pinch/fingertip
// geometry over a short window. This module never infers (and must never be extended to infer)
// object identity, applied force, comfort, pain, or accessibility — those all require context this
// module doesn't have. Keep any new rule here just as literal and inspectable as the ones below.

import type { UseObservation } from "@/lib/mission/services/contracts";
import type { CompactFrame, CompactHand, Vec3 } from "./types";

/** A hand counts as "engaged" (actively gripping or pinching) in a frame at this threshold. */
const ENGAGE_THRESHOLD = 0.6;
/** Regrasp = grab crosses this high mark... */
const REGRASP_HIGH = 0.7;
/** ...drops below this low mark... */
const REGRASP_LOW = 0.3;
/** ...then crosses the high mark again. */
const MIN_FRAMES = 5;
/** Displacement below this (mm) is treated as no meaningful approach direction. */
const APPROACH_MIN_MM = 30;
const SPAN_NARROW_MAX_MM = 80;
const SPAN_WIDE_MIN_MM = 130;

type Side = "left" | "right";
const SIDES: Side[] = ["left", "right"];

function isEngaged(hand: CompactHand): boolean {
  return hand.grab >= ENGAGE_THRESHOLD || hand.pinch >= ENGAGE_THRESHOLD;
}

function findHand(frame: CompactFrame, side: Side): CompactHand | undefined {
  return frame.hands.find((hand) => hand.side === side);
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Empty/default observation for a session with no usable data. */
const EMPTY_OBSERVATION: UseObservation = {
  handsUsed: 0,
  activeHand: "unknown",
  approachSide: "unknown",
  spanBand: "unknown",
  regraspObserved: false,
  trackingLossCount: 0,
};

/**
 * Reduces a full session (or window) of frames to a bounded UseObservation. See the module
 * comment above and the rule-by-rule comments below for exactly what each field means.
 */
export function observeSession(frames: CompactFrame[]): UseObservation {
  if (frames.length === 0) return { ...EMPTY_OBSERVATION };

  const presentCount: Record<Side, number> = { left: 0, right: 0 };
  const engagedCount: Record<Side, number> = { left: 0, right: 0 };
  const firstPresentIndex: Record<Side, number | null> = { left: null, right: null };
  const firstEngagedIndex: Record<Side, number | null> = { left: null, right: null };
  let bothEngagedCount = 0;
  let anyEngagedCount = 0;

  frames.forEach((frame, index) => {
    let engagedSides = 0;
    for (const side of SIDES) {
      const hand = findHand(frame, side);
      if (!hand) continue;
      presentCount[side] += 1;
      if (firstPresentIndex[side] === null) firstPresentIndex[side] = index;
      if (isEngaged(hand)) {
        engagedCount[side] += 1;
        engagedSides += 1;
        if (firstEngagedIndex[side] === null) firstEngagedIndex[side] = index;
      }
    }
    if (engagedSides === 2) bothEngagedCount += 1;
    if (engagedSides >= 1) anyEngagedCount += 1;
  });

  // handsUsed: 2 hands only when both were engaged AT ONCE for a real stretch; otherwise 1 hand
  // when any hand was engaged for a real stretch; otherwise however many hands merely showed up.
  let handsUsed: number;
  if (bothEngagedCount >= MIN_FRAMES) handsUsed = 2;
  else if (anyEngagedCount >= MIN_FRAMES) handsUsed = 1;
  else handsUsed = (presentCount.left >= MIN_FRAMES ? 1 : 0) + (presentCount.right >= MIN_FRAMES ? 1 : 0);

  // activeHand + the single side used for the per-hand rules below (approach/span/regrasp).
  let activeHand: UseObservation["activeHand"];
  let resolvedSide: Side | null = null;
  if (handsUsed === 2) {
    activeHand = "both";
    // For the per-hand rules, use whichever hand engaged first.
    const left = firstEngagedIndex.left;
    const right = firstEngagedIndex.right;
    if (left !== null && right !== null) resolvedSide = left <= right ? "left" : "right";
    else resolvedSide = left !== null ? "left" : "right";
  } else if (handsUsed === 1) {
    if (engagedCount.left !== engagedCount.right) {
      resolvedSide = engagedCount.left > engagedCount.right ? "left" : "right";
    } else if (presentCount.left !== presentCount.right) {
      resolvedSide = presentCount.left > presentCount.right ? "left" : "right";
    } else {
      resolvedSide = "right";
    }
    activeHand = resolvedSide;
  } else {
    activeHand = "unknown";
  }

  // approachSide: dominant axis of palm displacement from the active hand's first appearance to
  // its first engaged frame, if the displacement is large enough to mean anything.
  let approachSide: UseObservation["approachSide"] = "unknown";
  if (resolvedSide) {
    const startIndex = firstPresentIndex[resolvedSide];
    const engagedIndex = firstEngagedIndex[resolvedSide];
    if (startIndex !== null && engagedIndex !== null) {
      const startHand = findHand(frames[startIndex], resolvedSide);
      const engagedHand = findHand(frames[engagedIndex], resolvedSide);
      if (startHand && engagedHand) {
        const d: Vec3 = [
          engagedHand.palm[0] - startHand.palm[0],
          engagedHand.palm[1] - startHand.palm[1],
          engagedHand.palm[2] - startHand.palm[2],
        ];
        const abs = d.map(Math.abs);
        const dominant = abs.indexOf(Math.max(...abs));
        if (abs[dominant] > APPROACH_MIN_MM) {
          if (dominant === 2 && d[2] < 0) approachSide = "front";
          else if (dominant === 0 && d[0] > 0) approachSide = "left";
          else if (dominant === 0 && d[0] < 0) approachSide = "right";
          else if (dominant === 1 && d[1] < 0) approachSide = "top";
        }
      }
    }
  }

  // spanBand: median thumb-tip -> pinky-tip distance over the active hand's engaged frames.
  let spanBand: UseObservation["spanBand"] = "unknown";
  if (resolvedSide) {
    const spans: number[] = [];
    for (const frame of frames) {
      const hand = findHand(frame, resolvedSide);
      if (!hand || !isEngaged(hand)) continue;
      const tips = hand.fingertips;
      if (tips.length < 5) continue;
      spans.push(distance(tips[0], tips[4]));
    }
    const med = median(spans);
    if (med !== null) {
      spanBand = med < SPAN_NARROW_MAX_MM ? "small" : med <= SPAN_WIDE_MIN_MM ? "medium" : "large";
    }
  }

  // regraspObserved: the active hand's grab rose to a firm grip, let go, then gripped again.
  let regraspObserved = false;
  if (resolvedSide) {
    let sawHigh = false;
    let sawDrop = false;
    for (const frame of frames) {
      const hand = findHand(frame, resolvedSide);
      if (!hand) continue;
      if (!sawHigh) {
        if (hand.grab >= REGRASP_HIGH) sawHigh = true;
      } else if (!sawDrop) {
        if (hand.grab < REGRASP_LOW) sawDrop = true;
      } else if (hand.grab >= REGRASP_HIGH) {
        regraspObserved = true;
        break;
      }
    }
  }

  // trackingLossCount: a hand (any hand) disappeared entirely and later reappeared.
  let trackingLossCount = 0;
  let everPresent = false;
  let inGap = false;
  for (const frame of frames) {
    const present = frame.hands.length > 0;
    if (present) {
      if (inGap) {
        trackingLossCount += 1;
        inGap = false;
      }
      everPresent = true;
    } else if (everPresent) {
      inGap = true;
    }
  }

  return { handsUsed, activeHand, approachSide, spanBand, regraspObserved, trackingLossCount };
}

/** Incremental wrapper around observeSession for callers streaming frames off a live socket. */
export function createObserver(): {
  push(frame: CompactFrame): void;
  result(): UseObservation;
  frameCount(): number;
  reset(): void;
} {
  let frames: CompactFrame[] = [];
  return {
    push(frame: CompactFrame) {
      frames.push(frame);
    },
    result() {
      return observeSession(frames);
    },
    frameCount() {
      return frames.length;
    },
    reset() {
      frames = [];
    },
  };
}
