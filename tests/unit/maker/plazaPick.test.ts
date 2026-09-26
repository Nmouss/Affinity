import { describe, expect, it } from "vitest";
import {
  classifyPress,
  DRAG_HOLD_MS,
  DRAG_MOVE_THRESHOLD,
  ndcDistance,
  ndcToClientPx,
  shouldStartDrag,
} from "@/components/maker/plaza/plazaPick";

describe("ndcToClientPx", () => {
  it("maps NDC center to the middle of the viewport", () => {
    expect(ndcToClientPx([0, 0], 1000, 800)).toEqual([500, 400]);
  });

  it("maps NDC corners to pixel corners, flipping y (NDC up, client down)", () => {
    expect(ndcToClientPx([-1, 1], 1000, 800)).toEqual([0, 0]);
    expect(ndcToClientPx([1, 1], 1000, 800)).toEqual([1000, 0]);
    expect(ndcToClientPx([-1, -1], 1000, 800)).toEqual([0, 800]);
    expect(ndcToClientPx([1, -1], 1000, 800)).toEqual([1000, 800]);
  });

  it("scales linearly with viewport size", () => {
    expect(ndcToClientPx([0.5, 0.5], 1280, 800)).toEqual([960, 200]);
  });
});

describe("ndcDistance", () => {
  it("is zero for identical points", () => {
    expect(ndcDistance([0.2, -0.3], [0.2, -0.3])).toBe(0);
  });

  it("computes straight-line distance", () => {
    expect(ndcDistance([0, 0], [0.3, 0.4])).toBeCloseTo(0.5);
  });
});

describe("shouldStartDrag", () => {
  it("stays a pending press when held briefly with little movement", () => {
    expect(shouldStartDrag(50, 0.005)).toBe(false);
  });

  it("becomes a drag once the hold duration is reached, even with no movement", () => {
    expect(shouldStartDrag(DRAG_HOLD_MS, 0)).toBe(true);
    expect(shouldStartDrag(DRAG_HOLD_MS - 1, 0)).toBe(false);
  });

  it("becomes a drag once movement crosses the threshold, even instantly", () => {
    expect(shouldStartDrag(0, DRAG_MOVE_THRESHOLD)).toBe(true);
    expect(shouldStartDrag(0, DRAG_MOVE_THRESHOLD - 0.001)).toBe(false);
  });

  it("honors custom thresholds", () => {
    expect(shouldStartDrag(100, 0, 50, 0.1)).toBe(true);
    expect(shouldStartDrag(40, 0.05, 50, 0.1)).toBe(false);
  });
});

describe("classifyPress", () => {
  it("is a tap for a quick press released with little movement", () => {
    expect(classifyPress(1000, 1050, [0, 0], [0.001, 0])).toBe("tap");
  });

  it("is a drag once the press is held past the hold duration", () => {
    expect(classifyPress(1000, 1000 + DRAG_HOLD_MS + 10, [0, 0], [0, 0])).toBe("drag");
  });

  it("is a drag for a fast flick that crosses the movement threshold instantly", () => {
    expect(classifyPress(1000, 1000, [0, 0], [0.2, 0.2])).toBe("drag");
  });

  it("is still a tap right at the edge of both thresholds", () => {
    expect(classifyPress(1000, 1000 + DRAG_HOLD_MS - 1, [0, 0], [0, 0.01])).toBe("tap");
  });
});
