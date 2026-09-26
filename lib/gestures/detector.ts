import type { Gesture, HandFrame } from "./types";

export function detectGesture(frame: HandFrame): Gesture | undefined {
  if (frame.grabStrength > 0.9 && Math.abs(frame.rollRadians) >= Math.PI / 3) return "handshake";
  if (frame.pinchStrength > 0.8) return "pinch-drag";
  if (frame.grabStrength < 0.2) return "open-palm";
  return undefined;
}
