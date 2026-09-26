// The editor's preview turntable: yaw is plain mutable state (read every frame in useFrame, like
// lib/gestures/live.ts) so mouse drag, the hand's open-palm orbit gesture, and the auto-idle turn
// can all drive the same knob without React re-renders. Not persisted; resets on remount.

export const turntable = {
  /** Radians; the auto-idle turn advances it, drag/orbit add to it directly. */
  yaw: 0,
  /** Seconds since the last manual input; auto-idle turn only resumes after a short pause. */
  idleFor: 0,
};

/** Mouse drag and the hand's orbit gesture both report dx in NDC units per event/frame. */
export function addYaw(dx: number, sensitivity = 3.2): void {
  turntable.yaw += dx * sensitivity;
  turntable.idleFor = 0;
}

export function resetTurntable(): void {
  turntable.yaw = 0;
  turntable.idleFor = 0;
}
