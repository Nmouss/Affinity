import type { LeapStatus } from "./leap";
import type { HandFrame, LeapServiceInfo } from "./types";

// Module-level bridge between InputRoot (DOM side: socket and keys) and HandLayer (canvas side:
// runs the gesture machine every render). Plain mutable state, so per-frame reads cost nothing.

/** Frames older than this no longer count as a visible hand. */
export const FRAME_STALE_MS = 250;
/** Without frames for this long, the input source falls back to the keyboard. */
export const SOURCE_TIMEOUT_MS = 1000;

export type HandshakeAssistSource = "keyboard" | "button" | "pinch";

export const live = {
  frame: null as HandFrame | null,
  /** performance.now() when `frame` arrived. */
  frameAt: -Infinity,
  status: "closed" as LeapStatus,
  service: null as LeapServiceInfo | null,
  handshakeAssists: new Set<HandshakeAssistSource>(),
  /** Set by InputRoot on reset; HandLayer clears its machine and filters, then lowers it. */
  resetRequested: false,
};

export function receiveFrame(frame: HandFrame, now: number): void {
  live.frame = frame;
  live.frameAt = now;
}

export function framesFlowing(now: number): boolean {
  return now - live.frameAt < SOURCE_TIMEOUT_MS;
}

/** The latest frame while it is fresh, else null. */
export function freshFrame(now: number): HandFrame | null {
  return now - live.frameAt < FRAME_STALE_MS ? live.frame : null;
}

export function setHandshakeAssist(source: HandshakeAssistSource, held: boolean): void {
  if (held) live.handshakeAssists.add(source);
  else live.handshakeAssists.delete(source);
}

export function handshakeAssisted(): boolean {
  return live.handshakeAssists.size > 0;
}

export function requestInputReset(): void {
  live.handshakeAssists.clear();
  live.resetRequested = true;
}
