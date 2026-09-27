export type Vec3 = [number, number, number];

/** One tracked hand in Leap coordinates: mm, origin at the device, +y up, +z toward the user. */
export interface TrackedHand {
  id: number;
  side: "left" | "right";
  palm: Vec3;
  normal: Vec3;
  /** mm/s */
  velocity: Vec3;
  direction: Vec3;
  pinchStrength: number;
  grabStrength: number;
  /** Derived from palmNormal; 0 with the palm facing down, ±π/2 in a handshake. */
  rollRadians: number;
  /** Fingertips in mm, thumb first when the server reports finger types. */
  fingertips: Vec3[];
}

/** A normalized tracking frame. `hand` is the preferred hand (right over left), or null when none is visible. */
export interface HandFrame {
  id: number;
  /** Milliseconds (the Leap protocol sends microseconds). */
  timestamp: number;
  handCount: number;
  hand: TrackedHand | null;
}

/** The first message a Leap WebSocket server sends. Real servers send only `{"version":6}`. */
export interface LeapServiceInfo {
  version: number;
  serviceVersion: string | null;
  /** Set by scripts/leap/replay.mjs, or implied by a synthetic serviceVersion. */
  replay: boolean;
}
