import type { HandFrame, LeapServiceInfo, TrackedHand, Vec3 } from "./types";

// Client for the legacy Leap JSON protocol v6, as served by Ultraleap-Tracking-WS (and by
// scripts/leap/replay.mjs). The server only accepts the /v6.json path and streams frames only after
// the client sends a background or focused flag, which it matches as exact strings.

export const DEFAULT_LEAP_URL = "ws://127.0.0.1:6437/v6.json";

export const LEAP_CONTROL_MESSAGES = [
  JSON.stringify({ background: true }),
  JSON.stringify({ focused: true }),
  JSON.stringify({ optimizeHMD: false }),
];

export type LeapStatus = "connecting" | "open" | "closed";

/** Which hand drives the cursor: that side first (falling back to the other), or whichever comes first. */
export type HandPreference = "right" | "left" | "any";

export interface ConnectLeapOptions {
  url?: string;
  /** Defaults to NEXT_PUBLIC_LEAP_HAND, else "right". */
  hand?: HandPreference;
  onService?: (info: LeapServiceInfo) => void;
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

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

/** leapjs's roll: the palm normal's angle around the hand direction, 0 with the palm facing down. */
export function rollFromNormal(normal: Vec3): number {
  return Math.atan2(normal[0], -normal[1]);
}

/** Reads NEXT_PUBLIC_LEAP_HAND-style config; anything unrecognized means the default, "right". */
export function parseHandPreference(value: string | undefined): HandPreference {
  const normalized = value?.trim().toLowerCase();
  return normalized === "left" || normalized === "any" ? normalized : "right";
}

/** The preferred side when one is visible, otherwise the first hand. */
function preferredHand(hands: Json[], preference: HandPreference = "right"): Json | undefined {
  if (preference === "any") return hands[0];
  return hands.find((hand) => hand.type === preference) ?? hands[0];
}

export type HandSelector = (hands: Json[]) => Json | undefined;

/**
 * Stateful single-hand pick for a live stream. Once a hand is chosen it stays locked by its Leap
 * `id` for as long as it's tracked, so a second hand entering the field, or the service briefly
 * relabelling left/right (common with two hands close together), never moves the cursor to the
 * other hand. Only when the locked hand leaves does it pick again by preference.
 */
export function createHandSelector(preference: HandPreference = "right"): HandSelector {
  let lockedId: number | null = null;
  return (hands) => {
    const locked = lockedId === null ? undefined : hands.find((hand) => Number(hand.id) === lockedId);
    const chosen = locked ?? preferredHand(hands, preference);
    lockedId = chosen ? Number(chosen.id) : null;
    return chosen;
  };
}

function parseHand(raw: Json, pointables: Json[]): TrackedHand {
  const normal = vec3(raw.palmNormal);
  const id = Number(raw.id) || 0;
  const fingertips = pointables
    .filter((pointable) => Number(pointable.handId) === id)
    .sort((a, b) => (Number(a.type) || 0) - (Number(b.type) || 0))
    .map((pointable) => vec3(pointable.tipPosition));
  return {
    id,
    side: raw.type === "left" ? "left" : "right",
    palm: vec3(raw.palmPosition),
    normal,
    velocity: vec3(raw.palmVelocity),
    direction: vec3(raw.direction),
    pinchStrength: unit(raw.pinchStrength),
    grabStrength: unit(raw.grabStrength),
    rollRadians: rollFromNormal(normal),
    fingertips,
  };
}

/**
 * Normalizes one decoded message into a HandFrame, or null when it isn't a tracking frame. Without a
 * `select`, it takes the right hand over the left, statelessly; connectLeap passes a locking selector.
 */
export function parseLeapFrame(raw: unknown, select: HandSelector = preferredHand): HandFrame | null {
  if (!isObject(raw) || !Array.isArray(raw.hands) || typeof raw.timestamp !== "number") return null;
  const hands = raw.hands.filter(isObject);
  const pointables = Array.isArray(raw.pointables) ? raw.pointables.filter(isObject) : [];
  const chosen = select(hands);
  return {
    id: Number(raw.id) || 0,
    timestamp: raw.timestamp / 1000,
    handCount: hands.length,
    hand: chosen ? parseHand(chosen, pointables) : null,
  };
}

/** Reads the server's greeting (`{"version":6}`, plus serviceVersion on older servers). */
export function parseServiceInfo(raw: unknown): LeapServiceInfo | null {
  if (!isObject(raw) || typeof raw.version !== "number" || "hands" in raw) return null;
  const serviceVersion = typeof raw.serviceVersion === "string" ? raw.serviceVersion : null;
  return {
    version: raw.version,
    serviceVersion,
    replay: raw.replay === true || /synthetic|replay/i.test(serviceVersion ?? ""),
  };
}

function decode(data: unknown): unknown {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

/**
 * Connects to the Leap WebSocket and keeps reconnecting with backoff (0.5 s doubling to 5 s) until
 * the returned function is called.
 */
export function connectLeap(
  onFrame: (frame: HandFrame) => void,
  onStatus?: (status: LeapStatus) => void,
  options: ConnectLeapOptions = {},
): () => void {
  const url = options.url ?? process.env.NEXT_PUBLIC_LEAP_WS_URL ?? DEFAULT_LEAP_URL;
  const selectHand = createHandSelector(options.hand ?? parseHandPreference(process.env.NEXT_PUBLIC_LEAP_HAND));
  const minBackoff = options.minBackoffMs ?? 500;
  const maxBackoff = options.maxBackoffMs ?? 5000;
  let backoff = minBackoff;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const scheduleReconnect = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      open();
    }, backoff);
    backoff = Math.min(maxBackoff, backoff * 2);
  };

  const open = () => {
    if (stopped) return;
    onStatus?.("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      onStatus?.("closed");
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.addEventListener("open", () => {
      backoff = minBackoff;
      for (const message of LEAP_CONTROL_MESSAGES) ws.send(message);
      onStatus?.("open");
    });
    ws.addEventListener("message", (event) => {
      const raw = decode(event.data);
      const frame = parseLeapFrame(raw, selectHand);
      if (frame) {
        onFrame(frame);
        return;
      }
      const info = parseServiceInfo(raw);
      if (info) options.onService?.(info);
    });
    ws.addEventListener("close", () => {
      if (socket !== ws) return;
      socket = null;
      if (stopped) return;
      onStatus?.("closed");
      scheduleReconnect();
    });
    // Errors are always followed by close, which handles the reconnect.
    ws.addEventListener("error", () => undefined);
  };

  open();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    const ws = socket;
    socket = null;
    ws?.close();
    onStatus?.("closed");
  };
}
