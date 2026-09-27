import { describe, expect, it } from "vitest";
import { BLANK_LOOK, STARTER_LOOKS } from "@/lib/people/starters";
import { ACCESSORY_TYPES, EYE_TYPES, MOUTH_TYPES } from "@/types/character";
import type { CharacterLook } from "@/types/character";
import { CHARACTERS, characterForLook } from "@/components/sprites/characterPose";

describe("characterForLook", () => {
  it("keeps every starter within a few percent of today's CHARACTERS scale/width", () => {
    // The editor's height/build ranges were widened so a step is visible; grown-up height and a
    // medium build are anchored exactly, so starters move by at most ~3% in width.
    for (const id of ["wife", "daughter", "son"] as const) {
      const look = STARTER_LOOKS[id]!;
      const config = characterForLook(look, id);
      const today = CHARACTERS[id]!;
      expect(Math.abs(config.scale - today.scale)).toBeLessThanOrEqual(0.015);
      expect(Math.abs(config.width - today.width)).toBeLessThanOrEqual(0.035);
    }
  });

  it("makes height and build steps plainly visible in the editor", () => {
    const tall = characterForLook({ ...BLANK_LOOK, body: { height: 1, build: 0.5 } }, "x");
    const small = characterForLook({ ...BLANK_LOOK, body: { height: 0.6, build: 0.5 } }, "x");
    const wide = characterForLook({ ...BLANK_LOOK, body: { height: 1, build: 0.9 } }, "x");
    expect(small.scale / tall.scale).toBeLessThan(0.85);
    expect(wide.width / tall.width).toBeGreaterThan(1.12);
  });

  it("carries the look's accessory type straight through", () => {
    for (const id of ["wife", "daughter", "son"] as const) {
      const look = STARTER_LOOKS[id]!;
      expect(characterForLook(look, id).accessory).toBe(look.accessory.type);
    }
  });

  it("gives a finite, sane config for every accessory option", () => {
    for (const accessory of ACCESSORY_TYPES) {
      const look: CharacterLook = { ...BLANK_LOOK, accessory: { type: accessory, color: "#123456" } };
      const config = characterForLook(look, "someone");
      expect(config.accessory).toBe(accessory);
      for (const value of [config.scale, config.width, config.energy, config.phase, config.stride, config.walkSpeed, config.bounce]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(config.bounce).toBeGreaterThanOrEqual(0.03);
      expect(config.bounce).toBeLessThanOrEqual(0.05);
    }
  });

  it("gives a finite, sane config for every eye type", () => {
    for (const eyeType of EYE_TYPES) {
      const look: CharacterLook = { ...BLANK_LOOK, eyes: { ...BLANK_LOOK.eyes, type: eyeType } };
      const config = characterForLook(look, "someone");
      expect(Number.isFinite(config.scale)).toBe(true);
      expect(Number.isFinite(config.energy)).toBe(true);
    }
  });

  it("gives a finite, sane config for every mouth type", () => {
    for (const mouthType of MOUTH_TYPES) {
      const look: CharacterLook = { ...BLANK_LOOK, mouth: { type: mouthType } };
      const config = characterForLook(look, "someone");
      expect(Number.isFinite(config.scale)).toBe(true);
      expect(Number.isFinite(config.stride)).toBe(true);
    }
  });

  it("gives a smaller person a smaller scale and a shorter stride", () => {
    const tall: CharacterLook = { ...BLANK_LOOK, body: { height: 1, build: 0.5 } };
    const short: CharacterLook = { ...BLANK_LOOK, body: { height: 0.2, build: 0.5 } };
    const tallConfig = characterForLook(tall, "a");
    const shortConfig = characterForLook(short, "a");
    expect(shortConfig.scale).toBeLessThan(tallConfig.scale);
    expect(shortConfig.stride).toBeLessThan(tallConfig.stride);
  });

  it("gives different ids different phases for an identical look", () => {
    const phases = new Set(["wife", "daughter", "son", "friend-1", "friend-2"].map((id) => characterForLook(BLANK_LOOK, id).phase));
    expect(phases.size).toBeGreaterThan(1);
  });

  it("keeps every phase within the 0..4s range used elsewhere", () => {
    for (const id of ["a", "bb", "ccc", "dddd", "wife", "daughter", "son"]) {
      const phase = characterForLook(BLANK_LOOK, id).phase;
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(4);
    }
  });
});
