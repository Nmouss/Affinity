import { describe, expect, it } from "vitest";
import { activeSeatCount, MAX_SEATS, seatAngles } from "@/lib/stage/layout";

describe("seatAngles", () => {
  it("matches today's three-seat ring exactly", () => {
    expect(seatAngles(3)).toEqual([-0.8, 0, 0.8]);
  });

  it.each([1, 2, 3, 4, 5, 6])("is symmetric around 0 and within ±1.2 for n=%i", (n) => {
    const angles = seatAngles(n);
    expect(angles).toHaveLength(n);
    for (const angle of angles) expect(Math.abs(angle)).toBeLessThanOrEqual(1.2);
    // Symmetric: reversing the list and negating every angle reproduces it (within fp noise).
    const mirrored = [...angles].reverse().map((angle) => -angle);
    angles.forEach((angle, index) => expect(angle).toBeCloseTo(mirrored[index]!, 10));
  });

  it("clamps below 1 and above MAX_SEATS", () => {
    expect(seatAngles(0)).toEqual([0]);
    expect(seatAngles(-4)).toEqual([0]);
    expect(seatAngles(99)).toHaveLength(MAX_SEATS);
  });
});

describe("activeSeatCount", () => {
  it("is at least 3, grows with the party, and caps at MAX_SEATS", () => {
    expect(activeSeatCount(0)).toBe(3);
    expect(activeSeatCount(1)).toBe(3);
    expect(activeSeatCount(3)).toBe(3);
    expect(activeSeatCount(4)).toBe(4);
    expect(activeSeatCount(MAX_SEATS)).toBe(MAX_SEATS);
    expect(activeSeatCount(MAX_SEATS + 5)).toBe(MAX_SEATS);
  });
});
