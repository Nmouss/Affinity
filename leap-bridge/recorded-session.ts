// A deterministic, prerecorded session standing in for a live Leap capture: one right hand
// approaches from the front (moving toward the device, -z), grips (grab rises to ~0.85), presses
// down twice (palm y dips), never lets go, and is never lost by tracking. Frames are generated
// from a small keyframe timeline rather than written out by hand, so the numbers stay consistent
// and the shape of the gesture is easy to read.
//
// Feeding this through observeSession() should yield exactly:
//   { handsUsed: 1, activeHand: "right", approachSide: "front", spanBand: "medium",
//     regraspObserved: false, trackingLossCount: 0 }

import type { CompactFrame, RecordedSession, Vec3 } from "./types";

const FPS = 30;
const DURATION_SECONDS = 3;

/** [thumb, index, middle, ring, pinky] offsets (mm) from the palm; fixed, so span stays constant. */
const FINGERTIP_OFFSETS: Vec3[] = [
  [50, -5, 10],
  [30, -8, 60],
  [5, -10, 65],
  [-20, -10, 60],
  [-50, -10, 5],
];

interface Keyframe {
  /** seconds */
  t: number;
  x: number;
  y: number;
  z: number;
  grab: number;
  pinch: number;
}

// The approach happens over [0, 0.9]s: the hand starts 150mm from the device (toward the user)
// and closes to 30mm, crossing the 0.6 grab-engagement threshold at t=0.5 partway through, then
// reaching a firm ~0.85 grip by t=0.9 and holding it. Two presses (y dips) follow without ever
// releasing the grip, so no regrasp is observed.
const KEYFRAMES: Keyframe[] = [
  { t: 0.0, x: 0, y: 200, z: 150, grab: 0.05, pinch: 0.05 },
  { t: 0.5, x: 0, y: 200, z: 60, grab: 0.6, pinch: 0.05 },
  { t: 0.9, x: 0, y: 200, z: 30, grab: 0.85, pinch: 0.05 },
  { t: 1.2, x: 0, y: 200, z: 30, grab: 0.85, pinch: 0.05 },
  { t: 1.4, x: 0, y: 150, z: 30, grab: 0.85, pinch: 0.05 }, // press 1
  { t: 1.6, x: 0, y: 200, z: 30, grab: 0.85, pinch: 0.05 },
  { t: 2.0, x: 0, y: 200, z: 30, grab: 0.85, pinch: 0.05 },
  { t: 2.2, x: 0, y: 150, z: 30, grab: 0.85, pinch: 0.05 }, // press 2
  { t: 2.4, x: 0, y: 200, z: 30, grab: 0.85, pinch: 0.05 },
  { t: DURATION_SECONDS, x: 0, y: 200, z: 30, grab: 0.85, pinch: 0.05 },
];

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function sample(tSeconds: number): { palm: Vec3; grab: number; pinch: number } {
  let index = KEYFRAMES.findIndex((key) => key.t > tSeconds);
  if (index <= 0) index = KEYFRAMES.length - 1;
  const a = KEYFRAMES[index - 1];
  const b = KEYFRAMES[index];
  const span = b.t - a.t;
  const k = span > 0 ? Math.min(1, Math.max(0, (tSeconds - a.t) / span)) : 1;
  return {
    palm: [lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k)],
    grab: lerp(a.grab, b.grab, k),
    pinch: lerp(a.pinch, b.pinch, k),
  };
}

function generateFrames(): CompactFrame[] {
  const frames: CompactFrame[] = [];
  const frameCount = DURATION_SECONDS * FPS + 1;
  let previousPalm: Vec3 | null = null;

  for (let i = 0; i < frameCount; i += 1) {
    const tSeconds = i / FPS;
    const { palm, grab, pinch } = sample(tSeconds);
    const palmVelocity: Vec3 = previousPalm
      ? [(palm[0] - previousPalm[0]) * FPS, (palm[1] - previousPalm[1]) * FPS, (palm[2] - previousPalm[2]) * FPS]
      : [0, 0, 0];
    previousPalm = palm;

    const fingertips: Vec3[] = FINGERTIP_OFFSETS.map(
      ([dx, dy, dz]): Vec3 => [palm[0] + dx, palm[1] + dy, palm[2] + dz],
    );

    frames.push({
      t: Math.round(tSeconds * 1000),
      hands: [{ side: "right", palm, palmVelocity, pinch, grab, fingertips }],
    });
  }

  return frames;
}

export const recordedOneHandSession: RecordedSession = {
  id: "recorded-right-hand-grip-v1",
  label: "Right hand: approach, grip, two presses",
  recordedAt: "2026-01-01T00:00:00.000Z",
  description:
    "Synthetic ~3s / 30fps session: a right hand approaches from the front, grips to a firm hold " +
    "(~0.85), presses down twice without releasing, and is tracked continuously. Used as a " +
    "deterministic fixture and demo session — never presented to a shopper as a live capture.",
  frames: generateFrames(),
};
