import { describe, expect, it } from "vitest";
import { pickTarget } from "@/lib/gestures/hitTest";
import { createOneEuroFilter } from "@/lib/gestures/oneEuro";
import { createPointerFilter, DEFAULT_CALIBRATION, ndcToPalm, palmToNdc } from "@/lib/gestures/pointer";

describe("palmToNdc", () => {
  it("maps the calibration box onto the screen", () => {
    expect(palmToNdc([0, 250, 0])).toEqual([0, 0]);
    expect(palmToNdc([-150, 120, 0])).toEqual([-1, -1]);
    expect(palmToNdc([150, 380, 0])).toEqual([1, 1]);
    expect(palmToNdc([75, 315, 0])[0]).toBeCloseTo(0.5);
    expect(palmToNdc([75, 315, 0])[1]).toBeCloseTo(0.5);
  });

  it("clamps outside the box", () => {
    expect(palmToNdc([400, 20, 0])).toEqual([1, -1]);
    expect(palmToNdc([-400, 900, 0])).toEqual([-1, 1]);
  });

  it("honors a custom box and round-trips through ndcToPalm", () => {
    const box = { xMin: -100, xMax: 100, yMin: 150, yMax: 350 };
    expect(palmToNdc([50, 300, 0], box)).toEqual([0.5, 0.5]);
    expect(ndcToPalm([0.5, 0.5], box)).toEqual([50, 300]);
    expect(ndcToPalm([0, 0], DEFAULT_CALIBRATION)).toEqual([0, 250]);
  });
});

describe("One-Euro filter", () => {
  it("passes the first sample through and converges on a held value", () => {
    const filter = createOneEuroFilter();
    expect(filter.filter(10, 0)).toBe(10);
    let value = 0;
    for (let t = 16; t < 3000; t += 16) value = filter.filter(20, t);
    expect(value).toBeCloseTo(20, 1);
  });

  it("smooths jitter on a still hand", () => {
    const filter = createOneEuroFilter();
    const out: number[] = [];
    for (let i = 0; i < 200; i += 1) out.push(filter.filter(100 + (i % 2 === 0 ? 3 : -3), i * 10));
    const tail = out.slice(100);
    const spread = Math.max(...tail) - Math.min(...tail);
    expect(spread).toBeLessThan(2);
  });

  it("lags less when moving fast than a plain low-pass at the same cutoff", () => {
    const adaptive = createOneEuroFilter({ minCutoff: 1, beta: 0.02 });
    const fixed = createOneEuroFilter({ minCutoff: 1, beta: 0 });
    let a = 0;
    let f = 0;
    for (let i = 0; i <= 30; i += 1) {
      const x = i * 20; // 2000 mm/s
      a = adaptive.filter(x, i * 10);
      f = fixed.filter(x, i * 10);
    }
    expect(600 - a).toBeLessThan(600 - f);
  });

  it("restarts after a long gap instead of smearing", () => {
    const filter = createOneEuroFilter();
    filter.filter(0, 0);
    filter.filter(0, 10);
    expect(filter.filter(500, 5000)).toBe(500);
  });
});

describe("createPointerFilter", () => {
  it("smooths the palm, then maps it to NDC", () => {
    const pointer = createPointerFilter();
    expect(pointer.update([0, 250, 0], 0)).toEqual([0, 0]);
    const [x] = pointer.update([150, 250, 0], 16);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1);
  });
});

describe("pickTarget", () => {
  const targets = [
    { id: "sprite:wife" as const, ndc: [-0.5, 0] as [number, number], radius: 0.2 },
    { id: "hearth" as const, ndc: [0, 0.1] as [number, number], radius: 0.3 },
  ];

  it("picks the target whose radius contains the pointer", () => {
    expect(pickTarget([-0.45, 0.05], targets, 1)).toBe("sprite:wife");
    expect(pickTarget([0.05, 0.1], targets, 1)).toBe("hearth");
    expect(pickTarget([0.9, -0.9], targets, 1)).toBeNull();
  });

  it("corrects x for the aspect ratio", () => {
    // 0.15 NDC in x is 0.27 in y units on a 16:9 screen: outside the sprite's 0.2 radius.
    expect(pickTarget([-0.35, 0], targets, 1)).toBe("sprite:wife");
    expect(pickTarget([-0.35, 0], targets, 16 / 9)).toBeNull();
  });

  it("respects the accept filter", () => {
    expect(pickTarget([-0.5, 0], targets, 1, (id) => id !== "sprite:wife")).toBeNull();
  });
});
