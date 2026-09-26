// Parses one decoded message from the Ultraleap v6 WebSocket protocol
// (ws://127.0.0.1:6437/v6.json) into a CompactFrame, or returns null when the message isn't a
// tracking frame (e.g. the server's `{"version":6}` greeting, or garbage).
//
// Protocol reference: hands[] has id, type ('left'|'right'), palmPosition, palmVelocity,
// palmNormal, direction, pinchStrength, grabStrength; pointables[] has handId, type
// (0=thumb..4=pinky), tipPosition; timestamp is microseconds. See lib/gestures/leap.ts and
// scripts/leap/README.md for the verified protocol notes this mirrors.

import type { CompactFrame, CompactHand, Vec3 } from "./types";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function vec3(value: unknown): Vec3 {
  if (!Array.isArray(value)) return [0, 0, 0];
  return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0];
}

function unit(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function parseHand(raw: Json, pointables: Json[]): CompactHand | null {
  const side = raw.type === "left" ? "left" : raw.type === "right" ? "right" : null;
  if (!side) return null;
  const id = Number(raw.id) || 0;
  const fingertips = pointables
    .filter((pointable) => Number(pointable.handId) === id)
    .sort((a, b) => (Number(a.type) || 0) - (Number(b.type) || 0))
    .map((pointable) => vec3(pointable.tipPosition));
  return {
    side,
    palm: vec3(raw.palmPosition),
    palmVelocity: vec3(raw.palmVelocity),
    pinch: unit(raw.pinchStrength),
    grab: unit(raw.grabStrength),
    fingertips,
  };
}

/**
 * Normalizes one decoded v6 message into a CompactFrame, or returns null when it isn't a
 * tracking frame (missing `hands`/`timestamp`, or not an object at all).
 *
 * `sessionStartUs` is the raw (microsecond) timestamp of the first frame in the session; when
 * given, the returned frame's `t` is milliseconds since that start. When omitted, `t` is just the
 * frame's own timestamp converted to milliseconds (i.e. the caller is treating this frame as the
 * start of its own session). Callers that want session-relative timestamps across many frames
 * (see client.ts) should capture the first frame's raw timestamp and pass it to every later call.
 */
export function parseV6Frame(raw: unknown, sessionStartUs?: number): CompactFrame | null {
  if (!isObject(raw)) return null;
  if (!Array.isArray(raw.hands) || typeof raw.timestamp !== "number") return null;

  const pointables = Array.isArray(raw.pointables) ? raw.pointables.filter(isObject) : [];
  const hands: CompactHand[] = [];
  for (const entry of raw.hands) {
    if (!isObject(entry)) continue;
    const hand = parseHand(entry, pointables);
    if (hand) hands.push(hand);
  }

  const startUs = sessionStartUs ?? raw.timestamp;
  const t = (raw.timestamp - startUs) / 1000;
  return { t, hands };
}
