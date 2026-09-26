// Shared types for the Leap bridge: turning Ultraleap v6 protocol frames into a small, bounded
// "use observation" (see observe.ts for exactly what that does and doesn't claim).

/** Leap millimeters: +x right, +y up, +z toward the user. */
export type Vec3 = [number, number, number];

/** One hand in a single frame, reduced to the fields observe.ts actually uses. */
export interface CompactHand {
  side: "left" | "right";
  palm: Vec3;
  palmVelocity: Vec3;
  /** 0..1 */
  pinch: number;
  /** 0..1 */
  grab: number;
  /** Fingertips ordered thumb..pinky. May be empty if the source frame had no pointables. */
  fingertips: Vec3[];
}

/** A normalized tracking frame, timestamped relative to when the session/connection started. */
export interface CompactFrame {
  /** Milliseconds since session start. */
  t: number;
  hands: CompactHand[];
}

/** A prerecorded sequence of frames, played back instead of a live socket. */
export interface RecordedSession {
  id: string;
  label: string;
  /** ISO 8601 timestamp. */
  recordedAt: string;
  description: string;
  frames: CompactFrame[];
}

export type LeapStatus = "connecting" | "open" | "closed" | "unavailable";
