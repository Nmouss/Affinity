import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { activeSeatCount, CAMERA, HOME_SPOT_LIST, MAX_SEATS, seatAngles } from "@/lib/stage/layout";

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

describe("HOME_SPOT_LIST", () => {
  // Everyone standing at a home spot must be visible from the room's resting camera, feet to head,
  // on common laptop and projector aspect ratios.
  it.each([
    ["16:10", 1440 / 900],
    ["16:9", 1280 / 720],
  ])("keeps every family member in view at %s", (_label, aspect) => {
    const camera = new PerspectiveCamera(CAMERA.fov, aspect, 0.1, 100);
    camera.position.set(...CAMERA.position);
    camera.lookAt(...CAMERA.target);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    HOME_SPOT_LIST.forEach(([x, , z], index) => {
      for (const y of [0, 2.5]) {
        const ndc = new Vector3(x, y, z).project(camera);
        expect(Math.abs(ndc.x), `home spot ${index} (y=${y}) horizontally`).toBeLessThanOrEqual(1);
        expect(Math.abs(ndc.y), `home spot ${index} (y=${y}) vertically`).toBeLessThanOrEqual(1);
      }
    });
  });
});
