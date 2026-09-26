import { describe, expect, it } from "vitest";
import { SPRITE_MOODS } from "@/components/sprites/moodStyle";
import type { SpriteMood } from "@/types/stage";
import {
  CHARACTERS,
  JUMP_DURATION,
  createPose,
  poseFor,
  type CharacterConfig,
  type PoseInput,
} from "@/components/sprites/characterPose";

const characters = Object.values(CHARACTERS);

/** Builds a PoseInput with sane defaults so each test only spells out what it cares about. */
function input(overrides: Partial<PoseInput> & { mood: SpriteMood; character: CharacterConfig }): PoseInput {
  return {
    time: 0,
    sinceMood: 0,
    speed: 0,
    gaitPhase: 0,
    sinceJump: Infinity,
    sinceLand: Infinity,
    dragVelocityX: 0,
    ...overrides,
  };
}

describe("poseFor", () => {
  it("gives finite, sane numbers for every mood and character over time", () => {
    const times = [0, 0.2, 0.75, 1.4, 2.9, 5.3];
    for (const mood of SPRITE_MOODS) {
      for (const character of characters) {
        for (const t of times) {
          const pose = poseFor(input({ mood, character, time: t, sinceMood: t }));
          const label = `${mood}/${character.accessory}@${t}`;
          const scalars = [
            pose.lift,
            pose.squash,
            pose.lean,
            pose.nod,
            pose.twist,
            pose.spin,
            pose.armLeft.raise,
            pose.armLeft.swing,
            pose.armRight.raise,
            pose.armRight.swing,
            pose.footLeft.lift,
            pose.footLeft.pitch,
            pose.footLeft.forward,
            pose.footRight.lift,
            pose.footRight.pitch,
            pose.footRight.forward,
            pose.mouthOpen,
            pose.eyeLift,
            pose.glow,
          ];
          for (const value of scalars) expect(Number.isFinite(value), label).toBe(true);
          expect(pose.squash, label).toBeGreaterThan(0.7);
          expect(pose.squash, label).toBeLessThan(1.3);
        }
      }
    }
  });

  it("keeps idle feet nearly grounded and untwisted at speed 0", () => {
    for (const character of characters) {
      for (const t of [0, 1, 2, 3, 4, 5]) {
        const pose = poseFor(input({ mood: "idle", character, time: t, sinceMood: t }));
        expect(pose.footLeft.lift).toBeLessThanOrEqual(0.02);
        expect(pose.footRight.lift).toBeLessThanOrEqual(0.02);
        expect(pose.spin).toBe(0);
      }
    }
  });

  it("alternates feet and swings each arm opposite its own foot when walking", () => {
    const character = CHARACTERS.daughter!;
    const phases = Array.from({ length: 16 }, (_, index) => (index / 16) * Math.PI * 2);
    for (const gaitPhase of phases) {
      const pose = poseFor(input({ mood: "idle", character, speed: character.walkSpeed, gaitPhase }));
      // Never both feet lifted high at once.
      expect(pose.footLeft.lift > 0.05 && pose.footRight.lift > 0.05).toBe(false);
      if (pose.footLeft.forward !== 0) {
        expect(Math.sign(pose.armLeft.swing)).toBe(-Math.sign(pose.footLeft.forward));
      }
      if (pose.footRight.forward !== 0) {
        expect(Math.sign(pose.armRight.swing)).toBe(-Math.sign(pose.footRight.forward));
      }
    }
  });

  it("contributes nothing from the walk layer at speed 0", () => {
    const character = CHARACTERS.son!;
    const a = poseFor(input({ mood: "idle", character, time: 1.234, sinceMood: 1.234, speed: 0, gaitPhase: 0 }));
    const b = poseFor(
      input({ mood: "idle", character, time: 1.234, sinceMood: 1.234, speed: 0, gaitPhase: Math.PI / 2 }),
    );
    expect(b).toEqual(a);
  });

  it("crouches with no lift before rising, and dips again on landing", () => {
    const character = CHARACTERS.wife!;
    const crouch = poseFor(input({ mood: "idle", character, sinceJump: 0.05 }));
    expect(crouch.squash).toBeLessThan(1);
    expect(crouch.lift).toBeCloseTo(0, 5);

    const air = poseFor(input({ mood: "idle", character, sinceJump: JUMP_DURATION * 0.55 }));
    expect(air.lift).toBeGreaterThan(0);

    const landing = poseFor(input({ mood: "idle", character, sinceLand: 0.05 }));
    expect(landing.squash).toBeLessThan(1);
  });

  it("pedals its feet and leans against the drag when held", () => {
    const character = CHARACTERS.daughter!;
    let anyFootLifted = false;
    for (const t of [0.1, 0.3, 0.55, 0.8, 1.05, 1.3]) {
      const pose = poseFor(input({ mood: "held", character, time: t, sinceMood: t }));
      if (pose.footLeft.lift > 0.01 || pose.footRight.lift > 0.01) anyFootLifted = true;
    }
    expect(anyFootLifted).toBe(true);

    const draggedRight = poseFor(input({ mood: "held", character, dragVelocityX: 2 }));
    const draggedLeft = poseFor(input({ mood: "held", character, dragVelocityX: -2 }));
    expect(draggedRight.lean).not.toBe(0);
    expect(Math.sign(draggedRight.lean)).toBe(-Math.sign(draggedLeft.lean));
  });

  it("shakes its head while vetoing", () => {
    const character = CHARACTERS.wife!;
    let sawTwist = false;
    for (const t of [0.6, 0.8, 1.0, 1.2, 1.4]) {
      const pose = poseFor(input({ mood: "vetoing", character, time: t, sinceMood: t }));
      if (Math.abs(pose.twist) > 0.01) sawTwist = true;
    }
    expect(sawTwist).toBe(true);
  });

  it("slumps while conceding", () => {
    const character = CHARACTERS.son!;
    const pose = poseFor(input({ mood: "conceding", character, time: 0.5, sinceMood: 0.5 }));
    expect(pose.nod).toBeGreaterThan(0);
    expect(pose.armLeft.raise).toBeLessThan(0.28);
    expect(pose.armRight.raise).toBeLessThan(0.28);
    expect(pose.mouth).toBe("worried");
  });

  it("reuses the `out` pose instead of allocating", () => {
    const character = CHARACTERS.daughter!;
    const out = createPose();
    const armLeft = out.armLeft;
    const armRight = out.armRight;
    const footLeft = out.footLeft;
    const footRight = out.footRight;
    const result = poseFor(input({ mood: "happy", character, time: 1, sinceMood: 1 }), out);
    expect(result).toBe(out);
    expect(result.armLeft).toBe(armLeft);
    expect(result.armRight).toBe(armRight);
    expect(result.footLeft).toBe(footLeft);
    expect(result.footRight).toBe(footRight);
  });
});
