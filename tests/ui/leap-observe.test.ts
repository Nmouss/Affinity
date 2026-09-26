import { describe, expect, it, vi } from "vitest";
import {
  connectLeap,
  createObserver,
  observeSession,
  parseV6Frame,
  recordedOneHandSession,
} from "../../leap-bridge";
import type { CompactFrame, CompactHand, Vec3 } from "../../leap-bridge";

// NOTE: this file lives outside the frontend package, so its "vitest" import resolves to a
// different physical copy of the package than frontend/src does. That duplicate-install makes
// `expect(...).not` fail to type-check here (a tsc artifact, not a runtime issue) even though
// vitest itself runs the assertions fine. Assertions below avoid `.not` for that reason.
function didNotThrow(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

function hand(side: "left" | "right", palm: Vec3, overrides: Partial<CompactHand> = {}): CompactHand {
  return {
    side,
    palm,
    palmVelocity: [0, 0, 0],
    pinch: 0,
    grab: 0,
    fingertips: [],
    ...overrides,
  };
}

function frame(t: number, hands: CompactHand[]): CompactFrame {
  return { t, hands };
}

/** Fingertips whose thumb (index 0) -> pinky (index 4) distance is exactly `span` mm. */
function fingertipsWithSpan(span: number): Vec3[] {
  return [[span, 0, 0], [span * 0.6, 0, 0], [span * 0.4, 0, 0], [span * 0.2, 0, 0], [0, 0, 0]];
}

describe("observeSession", () => {
  it("returns the empty observation for no frames", () => {
    expect(observeSession([])).toEqual({
      handsUsed: 0,
      activeHand: "none",
      approachSide: "unknown",
      spanBand: "unknown",
      regraspObserved: false,
      trackingLossCount: 0,
    });
  });

  it("treats a hand as engaged on pinch alone, at the 0.6 threshold", () => {
    const frames: CompactFrame[] = [];
    for (let i = 0; i < 6; i += 1) {
      frames.push(frame(i, [hand("right", [0, 200, 100], { pinch: 0.6, grab: 0 })]));
    }
    const result = observeSession(frames);
    expect(result.handsUsed).toBe(1);
    expect(result.activeHand).toBe("right");
  });

  it("does not count a hand as engaged just below threshold", () => {
    const frames: CompactFrame[] = [];
    for (let i = 0; i < 10; i += 1) {
      frames.push(frame(i, [hand("right", [0, 200, 100], { pinch: 0.59, grab: 0.59 })]));
    }
    const result = observeSession(frames);
    // Present in >= 5 frames but never engaged -> handsUsed falls back to "present" counting.
    expect(result.handsUsed).toBe(1);
    expect(result.activeHand).toBe("right");
    expect(result.approachSide).toBe("unknown");
  });

  it("requires >= 5 frames of simultaneous engagement for handsUsed = 2", () => {
    const frames: CompactFrame[] = [];
    // Only 4 frames of simultaneous engagement -> not enough for handsUsed = 2.
    for (let i = 0; i < 4; i += 1) {
      frames.push(
        frame(i, [hand("left", [0, 200, 100], { grab: 0.8 }), hand("right", [0, 200, 100], { grab: 0.8 })]),
      );
    }
    // Right hand stays engaged alone afterward, pushing its own engaged count (but not the
    // simultaneous count) past the 5-frame threshold.
    for (let i = 4; i < 7; i += 1) frames.push(frame(i, [hand("right", [0, 200, 100], { grab: 0.8 })]));
    const result = observeSession(frames);
    expect(result.handsUsed).toBe(1);
    expect(result.activeHand).toBe("right");
  });

  it("reports two hands when both are engaged simultaneously for >= 5 frames", () => {
    const frames: CompactFrame[] = [];
    for (let i = 0; i < 6; i += 1) {
      frames.push(
        frame(i, [hand("left", [0, 200, 100], { grab: 0.8 }), hand("right", [0, 200, 100], { grab: 0.8 })]),
      );
    }
    const result = observeSession(frames);
    expect(result.handsUsed).toBe(2);
    expect(result.activeHand).toBe("both");
  });

  it("breaks activeHand ties on engaged-frame count, then present-frame count", () => {
    const frames: CompactFrame[] = [];
    // Right hand engaged more often -> right wins despite left being present more.
    for (let i = 0; i < 3; i += 1) frames.push(frame(i, [hand("right", [0, 200, 100], { grab: 0.8 })]));
    for (let i = 3; i < 8; i += 1) frames.push(frame(i, [hand("left", [0, 200, 100], { grab: 0.61 })]));
    const result = observeSession(frames);
    expect(result.activeHand).toBe("left");
  });

  it("computes approachSide 'front' for a hand closing in -z before engaging", () => {
    const frames: CompactFrame[] = [];
    // Appears far in +z (toward user), moves to -z (toward device) as it engages.
    for (let i = 0; i < 5; i += 1) {
      const z = 150 - i * 30; // 150, 120, 90, 60, 30
      const grab = i < 3 ? 0.1 : 0.8;
      frames.push(frame(i, [hand("right", [0, 200, z], { grab })]));
    }
    for (let i = 5; i < 10; i += 1) frames.push(frame(i, [hand("right", [0, 200, 30], { grab: 0.8 })]));
    const result = observeSession(frames);
    expect(result.approachSide).toBe("front");
  });

  it("computes approachSide 'left' for a hand crossing in +x before engaging", () => {
    const frames: CompactFrame[] = [];
    for (let i = 0; i < 5; i += 1) {
      const x = i * 30; // 0, 30, 60, 90, 120
      const grab = i < 3 ? 0.1 : 0.8;
      frames.push(frame(i, [hand("right", [x, 200, 100], { grab })]));
    }
    for (let i = 5; i < 10; i += 1) frames.push(frame(i, [hand("right", [120, 200, 100], { grab: 0.8 })]));
    expect(observeSession(frames).approachSide).toBe("left");
  });

  it("computes approachSide 'right' for a hand crossing in -x before engaging", () => {
    const frames: CompactFrame[] = [];
    for (let i = 0; i < 5; i += 1) {
      const x = -i * 30;
      const grab = i < 3 ? 0.1 : 0.8;
      frames.push(frame(i, [hand("right", [x, 200, 100], { grab })]));
    }
    for (let i = 5; i < 10; i += 1) frames.push(frame(i, [hand("right", [-120, 200, 100], { grab: 0.8 })]));
    expect(observeSession(frames).approachSide).toBe("right");
  });

  it("computes approachSide 'top' for a hand descending in -y before engaging", () => {
    const frames: CompactFrame[] = [];
    for (let i = 0; i < 5; i += 1) {
      const y = 300 - i * 30;
      const grab = i < 3 ? 0.1 : 0.8;
      frames.push(frame(i, [hand("right", [0, y, 100], { grab })]));
    }
    for (let i = 5; i < 10; i += 1) frames.push(frame(i, [hand("right", [0, 150, 100], { grab: 0.8 })]));
    expect(observeSession(frames).approachSide).toBe("top");
  });

  it("reports approachSide 'unknown' when displacement is below 30mm", () => {
    const frames: CompactFrame[] = [];
    for (let i = 0; i < 10; i += 1) frames.push(frame(i, [hand("right", [0, 200, 100], { grab: 0.8 })]));
    expect(observeSession(frames).approachSide).toBe("unknown");
  });

  it("bands spanBand narrow / medium / wide from thumb-to-pinky distance", () => {
    const build = (span: number) => {
      const frames: CompactFrame[] = [];
      for (let i = 0; i < 6; i += 1) {
        frames.push(frame(i, [hand("right", [0, 200, 100], { grab: 0.8, fingertips: fingertipsWithSpan(span) })]));
      }
      return observeSession(frames);
    };
    expect(build(50).spanBand).toBe("narrow");
    expect(build(100).spanBand).toBe("medium");
    expect(build(160).spanBand).toBe("wide");
  });

  it("reports spanBand 'unknown' with no fingertip data", () => {
    const frames: CompactFrame[] = [];
    for (let i = 0; i < 6; i += 1) frames.push(frame(i, [hand("right", [0, 200, 100], { grab: 0.8 })]));
    expect(observeSession(frames).spanBand).toBe("unknown");
  });

  it("detects a regrasp: high grab, drop below 0.3, high grab again", () => {
    const grabs = [0.8, 0.75, 0.2, 0.1, 0.75, 0.8];
    const frames = grabs.map((grab, i) => frame(i, [hand("right", [0, 200, 100], { grab })]));
    expect(observeSession(frames).regraspObserved).toBe(true);
  });

  it("does not report a regrasp when grab never drops below 0.3 after a firm grip", () => {
    const grabs = [0.8, 0.78, 0.5, 0.4, 0.75, 0.8];
    const frames = grabs.map((grab, i) => frame(i, [hand("right", [0, 200, 100], { grab })]));
    expect(observeSession(frames).regraspObserved).toBe(false);
  });

  it("counts a tracking gap that later reappears, but not a trailing disappearance", () => {
    const frames: CompactFrame[] = [
      frame(0, [hand("right", [0, 200, 100], { grab: 0.8 })]),
      frame(1, [hand("right", [0, 200, 100], { grab: 0.8 })]),
      frame(2, []), // gap
      frame(3, []),
      frame(4, [hand("right", [0, 200, 100], { grab: 0.8 })]), // reappears
      frame(5, [hand("right", [0, 200, 100], { grab: 0.8 })]),
      frame(6, []), // trailing disappearance, never reappears
    ];
    expect(observeSession(frames).trackingLossCount).toBe(1);
  });

  it("counts multiple tracking gaps", () => {
    const frames: CompactFrame[] = [
      frame(0, [hand("right", [0, 200, 100], { grab: 0.8 })]),
      frame(1, []),
      frame(2, [hand("right", [0, 200, 100], { grab: 0.8 })]),
      frame(3, []),
      frame(4, [hand("right", [0, 200, 100], { grab: 0.8 })]),
    ];
    expect(observeSession(frames).trackingLossCount).toBe(2);
  });

  it("matches the documented result for the recorded one-hand session", () => {
    expect(observeSession(recordedOneHandSession.frames)).toEqual({
      handsUsed: 1,
      activeHand: "right",
      approachSide: "front",
      spanBand: "medium",
      regraspObserved: false,
      trackingLossCount: 0,
    });
  });
});

describe("createObserver", () => {
  it("accumulates pushed frames and can be reset", () => {
    const observer = createObserver();
    expect(observer.frameCount()).toBe(0);
    for (let i = 0; i < 6; i += 1) observer.push(frame(i, [hand("right", [0, 200, 100], { grab: 0.8 })]));
    expect(observer.frameCount()).toBe(6);
    expect(observer.result().handsUsed).toBe(1);
    observer.reset();
    expect(observer.frameCount()).toBe(0);
    expect(observer.result().handsUsed).toBe(0);
  });
});

describe("parseV6Frame", () => {
  it("parses a sample raw v6 frame", () => {
    const raw = {
      id: 42,
      timestamp: 1_000_000, // microseconds
      currentFrameRate: 30,
      hands: [
        {
          id: 1,
          type: "right",
          palmPosition: [10, 200, 30],
          palmVelocity: [1, 2, 3],
          palmNormal: [0, -1, 0],
          direction: [0, 0, -1],
          pinchStrength: 0.1,
          grabStrength: 0.85,
        },
      ],
      pointables: [
        { handId: 1, type: 0, tipPosition: [60, 195, 40] },
        { handId: 1, type: 4, tipPosition: [-40, 190, 35] },
      ],
    };

    const parsed = parseV6Frame(raw, 500_000);
    expect(parsed === null).toBe(false);
    expect(parsed?.t).toBe(500); // (1_000_000 - 500_000) / 1000
    expect(parsed?.hands).toHaveLength(1);
    expect(parsed?.hands[0]).toMatchObject({
      side: "right",
      palm: [10, 200, 30],
      palmVelocity: [1, 2, 3],
      pinch: 0.1,
      grab: 0.85,
    });
    expect(parsed?.hands[0].fingertips[0]).toEqual([60, 195, 40]);
  });

  it("defaults the session start to the frame's own timestamp when omitted", () => {
    const raw = { timestamp: 2_000_000, hands: [] };
    expect(parseV6Frame(raw)).toEqual({ t: 0, hands: [] });
  });

  it("returns null for garbage input", () => {
    expect(parseV6Frame(null)).toBeNull();
    expect(parseV6Frame(undefined)).toBeNull();
    expect(parseV6Frame("not json")).toBeNull();
    expect(parseV6Frame(42)).toBeNull();
    expect(parseV6Frame([])).toBeNull();
    expect(parseV6Frame({ version: 6 })).toBeNull(); // the server's greeting, no hands/timestamp
    expect(parseV6Frame({ hands: [] })).toBeNull(); // missing timestamp
    expect(parseV6Frame({ timestamp: 1 })).toBeNull(); // missing hands
  });
});

describe("connectLeap", () => {
  it("reports 'unavailable' and returns a no-op disconnect when WebSocket is undefined", () => {
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = undefined;
    try {
      const onStatus = vi.fn();
      const onFrame = vi.fn();
      const disconnect = connectLeap({ onFrame, onStatus });
      expect(onStatus).toHaveBeenCalledWith("unavailable");
      expect(onFrame.mock.calls.length).toBe(0);
      expect(didNotThrow(() => disconnect())).toBe(true);
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = original;
    }
  });

  it("does not throw when WebSocket construction throws", () => {
    const original = (globalThis as { WebSocket?: unknown }).WebSocket;
    class ThrowingWebSocket {
      constructor() {
        throw new Error("no socket available in this environment");
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).WebSocket = ThrowingWebSocket;
    try {
      const onStatus = vi.fn();
      let disconnect: () => void = () => undefined;
      const constructed = didNotThrow(() => {
        disconnect = connectLeap({ onFrame: vi.fn(), onStatus });
      });
      expect(constructed).toBe(true);
      expect(onStatus).toHaveBeenCalledWith("unavailable");
      expect(didNotThrow(() => disconnect())).toBe(true);
    } finally {
      (globalThis as { WebSocket?: unknown }).WebSocket = original;
    }
  });
});
