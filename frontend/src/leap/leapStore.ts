import { useEffect, useSyncExternalStore } from "react";
import { type CompactFrame, connectLeap, type LeapStatus } from "../../../leap-bridge";

// One shared Leap connection for the whole app. Frames go to subscribers through callbacks so 3D
// rotation can read them at frame rate without re-rendering React; only status changes re-render.

type FrameListener = (frame: CompactFrame) => void;

const frameListeners = new Set<FrameListener>();
const statusListeners = new Set<() => void>();
let status: LeapStatus = "closed";
let disconnect: (() => void) | null = null;
let lastFrameAt = 0;

function setStatus(next: LeapStatus) {
  status = next;
  statusListeners.forEach((l) => l());
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryMs = 4000;
const RETRY_MAX_MS = 30000;

/** Connects to the Leap bridge and keeps retrying quietly, so starting the bridge late still works. */
export function startLeap(url = import.meta.env?.VITE_LEAP_WS_URL as string | undefined) {
  stopLeap();
  const connect = () => {
    retryTimer = null;
    disconnect = connectLeap({
      url,
      onStatus(next) {
        setStatus(next);
        if (next === "open") retryMs = 4000;
        if (next === "closed" && disconnect && !retryTimer) {
          retryTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(RETRY_MAX_MS, retryMs * 2);
        }
      },
      onFrame(frame) {
        lastFrameAt = performance.now();
        frameListeners.forEach((l) => l(frame));
      },
    });
  };
  connect();
}

export function stopLeap() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const current = disconnect;
  disconnect = null;
  current?.();
  setStatus("closed");
}

/** True when frames arrived in the last second — an open socket alone doesn't mean hands are tracked. */
export const leapTracking = () => status === "open" && performance.now() - lastFrameAt < 1000;

export function useLeapStatus(): LeapStatus {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => status,
    () => status,
  );
}

export function useLeapFrames(listener: FrameListener | null) {
  useEffect(() => {
    if (!listener) return;
    frameListeners.add(listener);
    return () => {
      frameListeners.delete(listener);
    };
  }, [listener]);
}

/**
 * Horizontal swipe from palm velocity: > 700 mm/s sideways with the hand open, one per 900 ms.
 * Returns a frame listener to pass to useLeapFrames.
 */
export function swipeDetector(onSwipe: (direction: "left" | "right") => void): FrameListener {
  let cooldownUntil = 0;
  return (frame) => {
    const hand = frame.hands[0];
    if (!hand || frame.t < cooldownUntil || hand.grab > 0.5) return;
    const vx = hand.palmVelocity[0];
    if (Math.abs(vx) < 700) return;
    cooldownUntil = frame.t + 900;
    onSwipe(vx > 0 ? "right" : "left");
  };
}
