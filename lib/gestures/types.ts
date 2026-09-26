export type Gesture = "hover" | "pinch-tap" | "pinch-drag" | "open-palm" | "swipe" | "handshake";

export interface HandFrame {
  timestamp: number;
  palm: [number, number, number];
  velocity: [number, number, number];
  pinchStrength: number;
  grabStrength: number;
  rollRadians: number;
}
