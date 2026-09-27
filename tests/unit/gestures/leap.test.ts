import { describe, expect, it } from "vitest";
import {
  createHandSelector,
  parseHandPreference,
  parseLeapFrame,
  parseServiceInfo,
  rollFromNormal,
} from "@/lib/gestures/leap";

function hand(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    type: "right",
    palmPosition: [10, 200, 5],
    palmNormal: [0, -1, 0],
    palmVelocity: [1, 2, 3],
    direction: [0, 0, -1],
    pinchStrength: 0.4,
    grabStrength: 0.2,
    ...overrides,
  };
}

describe("rollFromNormal", () => {
  it("is 0 with the palm down and ±90° with the palm facing sideways", () => {
    expect(rollFromNormal([0, -1, 0])).toBeCloseTo(0);
    expect(rollFromNormal([-1, 0, 0]) * (180 / Math.PI)).toBeCloseTo(-90);
    expect(rollFromNormal([1, 0, 0]) * (180 / Math.PI)).toBeCloseTo(90);
  });
});

describe("parseLeapFrame", () => {
  it("converts microseconds to milliseconds and computes roll from palmNormal", () => {
    const frame = parseLeapFrame({
      id: 3,
      timestamp: 1_500_000,
      hands: [hand({ palmNormal: [-1, 0, 0] })],
      pointables: [],
    });
    expect(frame?.timestamp).toBe(1500);
    expect(frame?.id).toBe(3);
    expect(frame?.hand?.rollRadians).toBeCloseTo(-Math.PI / 2);
    expect(frame?.hand?.palm).toEqual([10, 200, 5]);
  });

  it("prefers the right hand even when the left comes first", () => {
    const frame = parseLeapFrame({
      id: 1,
      timestamp: 0,
      hands: [hand({ id: 1, type: "left", pinchStrength: 0.1 }), hand({ id: 2, type: "right", pinchStrength: 0.9 })],
    });
    expect(frame?.handCount).toBe(2);
    expect(frame?.hand?.side).toBe("right");
    expect(frame?.hand?.pinchStrength).toBe(0.9);
  });

  it("falls back to a lone left hand", () => {
    const frame = parseLeapFrame({ id: 1, timestamp: 0, hands: [hand({ type: "left" })] });
    expect(frame?.hand?.side).toBe("left");
  });

  it("takes the chosen hand's fingertips from pointables, thumb first", () => {
    const frame = parseLeapFrame({
      id: 1,
      timestamp: 0,
      hands: [hand({ id: 7 })],
      pointables: [
        { handId: 7, type: 1, tipPosition: [1, 1, 1] },
        { handId: 99, type: 0, tipPosition: [9, 9, 9] },
        { handId: 7, type: 0, tipPosition: [0, 0, 0] },
      ],
    });
    expect(frame?.hand?.fingertips).toEqual([
      [0, 0, 0],
      [1, 1, 1],
    ]);
  });

  it("keeps frames without hands, with hand = null", () => {
    const frame = parseLeapFrame({ id: 5, timestamp: 1000, hands: [], pointables: [] });
    expect(frame).toEqual({ id: 5, timestamp: 1, handCount: 0, hand: null });
  });

  it("ignores anything that isn't a frame", () => {
    expect(parseLeapFrame({ version: 6 })).toBeNull();
    expect(parseLeapFrame({ serviceVersion: "6.2.0", version: 6 })).toBeNull();
    expect(parseLeapFrame({ event: { type: "deviceEvent" } })).toBeNull();
    expect(parseLeapFrame("nope")).toBeNull();
    expect(parseLeapFrame(null)).toBeNull();
  });
});

describe("parseServiceInfo", () => {
  it("reads the real server's bare greeting as a live source", () => {
    expect(parseServiceInfo({ version: 6 })).toEqual({ version: 6, serviceVersion: null, replay: false });
  });

  it("detects replays and synthetic sessions", () => {
    expect(parseServiceInfo({ serviceVersion: "synthetic", version: 6 })?.replay).toBe(true);
    expect(parseServiceInfo({ version: 6, replay: true })?.replay).toBe(true);
  });

  it("ignores frames", () => {
    expect(parseServiceInfo({ version: 6, hands: [], timestamp: 0 })).toBeNull();
  });
});

describe("createHandSelector", () => {
  const frame = (...hands: ReturnType<typeof hand>[]) => ({ id: 1, timestamp: 0, hands });
  const right = hand({ id: 1, type: "right" });
  const left = hand({ id: 2, type: "left" });

  it("stays on the locked hand when a second hand enters, even the preferred side", () => {
    const select = createHandSelector("right");
    expect(parseLeapFrame(frame(left), select)?.hand?.id).toBe(2);
    expect(parseLeapFrame(frame(left, right), select)?.hand?.id).toBe(2);
    expect(parseLeapFrame(frame(right, left), select)?.hand?.id).toBe(2);
  });

  it("ignores the service relabelling the locked hand's side", () => {
    const select = createHandSelector("right");
    expect(parseLeapFrame(frame(right, left), select)?.hand?.id).toBe(1);
    const swapped = frame(hand({ id: 1, type: "left" }), hand({ id: 2, type: "right" }));
    expect(parseLeapFrame(swapped, select)?.hand?.id).toBe(1);
  });

  it("re-picks by preference once the locked hand leaves", () => {
    const select = createHandSelector("right");
    expect(parseLeapFrame(frame(right), select)?.hand?.id).toBe(1);
    expect(parseLeapFrame(frame(), select)?.hand).toBeNull();
    expect(parseLeapFrame(frame(left, hand({ id: 3, type: "right" })), select)?.hand?.id).toBe(3);
  });

  it("honours left and any", () => {
    expect(parseLeapFrame(frame(right, left), createHandSelector("left"))?.hand?.id).toBe(2);
    expect(parseLeapFrame(frame(left, right), createHandSelector("any"))?.hand?.id).toBe(2);
  });
});

describe("parseHandPreference", () => {
  it("reads left/any case-insensitively and defaults to right", () => {
    expect(parseHandPreference("Left")).toBe("left");
    expect(parseHandPreference(" any ")).toBe("any");
    expect(parseHandPreference("right")).toBe("right");
    expect(parseHandPreference(undefined)).toBe("right");
    expect(parseHandPreference("both")).toBe("right");
  });
});
