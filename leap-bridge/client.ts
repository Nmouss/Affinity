// Browser WebSocket client for the Ultraleap v6 protocol server (see scripts/leap/README.md and
// lib/gestures/leap.ts for the verified protocol notes). Only the /v6.json path is accepted, and
// the server streams frames only after it receives the exact strings
// JSON.stringify({background:true}) and JSON.stringify({focused:true}).
//
// This client never throws: if `WebSocket` doesn't exist (SSR, a test environment, an older
// browser) or the connection fails outright, it reports "unavailable"/"closed" through onStatus
// instead of throwing, and always returns a safe (possibly no-op) disconnect function.

import { parseV6Frame } from "./parse";
import type { CompactFrame, LeapStatus } from "./types";

export const DEFAULT_LEAP_URL = "ws://127.0.0.1:6437/v6.json";

export interface ConnectLeapOptions {
  url?: string;
  onFrame: (frame: CompactFrame) => void;
  onStatus: (status: LeapStatus) => void;
}

function extractTimestamp(raw: unknown): number | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const timestamp = (raw as Record<string, unknown>).timestamp;
  return typeof timestamp === "number" ? timestamp : undefined;
}

function decode(data: unknown): unknown {
  if (typeof data !== "string") return undefined;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

const noop = () => undefined;

/** Connects to the Leap bridge and streams CompactFrames until the returned function is called. */
export function connectLeap(opts: ConnectLeapOptions): () => void {
  const { url = DEFAULT_LEAP_URL, onFrame, onStatus } = opts;

  const WebSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (typeof WebSocketCtor !== "function") {
    onStatus("unavailable");
    return noop;
  }

  let sessionStartUs: number | null = null;
  let stopped = false;
  let socket: WebSocket;

  onStatus("connecting");
  try {
    socket = new WebSocketCtor(url);
  } catch {
    onStatus("unavailable");
    return noop;
  }

  const ws = socket;

  ws.addEventListener("open", () => {
    if (stopped) return;
    try {
      ws.send(JSON.stringify({ background: true }));
      ws.send(JSON.stringify({ focused: true }));
    } catch {
      // If sending fails the socket is already on its way to closing; the close handler covers it.
    }
    onStatus("open");
  });

  ws.addEventListener("message", (event) => {
    if (stopped) return;
    const raw = decode((event as MessageEvent).data);
    const timestamp = extractTimestamp(raw);
    if (sessionStartUs === null && timestamp !== undefined) sessionStartUs = timestamp;
    const frame = parseV6Frame(raw, sessionStartUs ?? undefined);
    if (frame) onFrame(frame);
  });

  ws.addEventListener("close", () => {
    if (stopped) return;
    onStatus("closed");
  });

  // Errors are always followed by close, which reports status; nothing else to do here.
  ws.addEventListener("error", noop);

  return () => {
    if (stopped) return;
    stopped = true;
    try {
      ws.close();
    } catch {
      // Already closed/closing — nothing to do.
    }
    onStatus("closed");
  };
}
