import { describe, expect, it } from "vitest";
import { PEDESTAL_RADIUS, STAGE_FOOTPRINT, pedestalInspectTarget, pedestalPositions } from "@/lib/product/layout";

describe("pedestalPositions", () => {
  it("returns nothing for zero and centers a single pedestal on the stage", () => {
    expect(pedestalPositions(0)).toEqual([]);
    expect(pedestalPositions(1)).toEqual([STAGE_FOOTPRINT.center]);
  });

  it.each([1, 2, 3, 4, 5, 6, 8])("keeps %i pedestals apart and inside the stage footprint", (count) => {
    const positions = pedestalPositions(count);
    expect(positions).toHaveLength(count);
    const [cx, , cz] = STAGE_FOOTPRINT.center;
    for (const [x, y, z] of positions) {
      expect(y).toBe(0);
      expect(Math.abs(x - cx)).toBeLessThanOrEqual(STAGE_FOOTPRINT.halfWidth + 1e-9);
      expect(Math.abs(z - cz)).toBeLessThanOrEqual(STAGE_FOOTPRINT.halfDepth + 1e-9);
    }
    for (let a = 0; a < positions.length; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        const distance = Math.hypot(positions[a]![0] - positions[b]![0], positions[a]![2] - positions[b]![2]);
        expect(distance, `pedestals ${a} and ${b}`).toBeGreaterThanOrEqual(PEDESTAL_RADIUS * 2);
      }
    }
  });

  it("lays out left to right, symmetric about the center", () => {
    const [left, right] = pedestalPositions(2);
    expect(left![0]).toBeLessThan(right![0]);
    expect(left![0] + right![0]).toBeCloseTo(STAGE_FOOTPRINT.center[0] * 2);
  });

  it("points the inspect camera just above the pedestal top", () => {
    const target = pedestalInspectTarget([1, 0, -3]);
    expect(target[0]).toBe(1);
    expect(target[2]).toBe(-3);
    expect(target[1]).toBeGreaterThan(0.5);
  });
});
