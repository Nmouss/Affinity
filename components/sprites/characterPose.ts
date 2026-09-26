import type { SpriteMood } from "@/types/stage";

// Mood + locomotion → joint targets for CharacterModel. Pure (no three.js) so it is unit-tested,
// and it writes into a reused Pose so nothing allocates per frame. CharacterModel springs every
// value; SpriteToken fills CharacterMotion as the character walks, jumps, and is dragged.
// Units are the unscaled model's (soles at y = 0, head top at MODEL_HEIGHT) unless noted.

export type Accessory = "scarf" | "bow" | "dinosaur";
export type Fidget = "toeBounce" | "sway" | "scarfTug";

export interface CharacterConfig {
  accessory: Accessory;
  /** Model scale; the character stands MODEL_HEIGHT * scale ft tall. */
  scale: number;
  /** Body width multiplier. */
  width: number;
  /** Gesture amplitude multiplier (Leo is the bounciest). */
  energy: number;
  /** Time offset in seconds so the family never moves in lockstep. */
  phase: number;
  /** World ft covered per full gait cycle (two steps). */
  stride: number;
  /** Top walking speed in world ft/s. */
  walkSpeed: number;
  /** Body bob per step, model units. */
  bounce: number;
  fidget: Fidget;
}

/** Unscaled model height, soles to head top. */
export const MODEL_HEIGHT = 2.13;

/** How long a jump (crouch, takeoff, air, landing) and a drop landing take, in seconds. */
export const JUMP_DURATION = 0.9;
export const LAND_DURATION = 0.35;

export const CHARACTERS: Record<string, CharacterConfig> = {
  wife: { accessory: "scarf", scale: 0.95, width: 1, energy: 0.72, phase: 0, stride: 1.3, walkSpeed: 3.2, bounce: 0.03, fidget: "scarfTug" },
  daughter: { accessory: "bow", scale: 0.86, width: 0.98, energy: 1, phase: 3.3, stride: 1.1, walkSpeed: 3.4, bounce: 0.04, fidget: "sway" },
  son: { accessory: "dinosaur", scale: 0.84, width: 1.05, energy: 1.2, phase: 1.6, stride: 1, walkSpeed: 3.8, bounce: 0.05, fidget: "toeBounce" },
};

export function characterFor(id: string): CharacterConfig {
  return CHARACTERS[id] ?? CHARACTERS.daughter!;
}

/** Lab-tunable multipliers (leva sliders in SpriteLab mutate these). */
export const characterTuning = { scale: 1, walkSpeed: 1 };

/** Standing height in world ft, including the lab scale. */
export function characterHeight(id: string): number {
  return MODEL_HEIGHT * characterFor(id).scale * characterTuning.scale;
}

/** Written by SpriteToken every frame, read by CharacterModel. */
export interface CharacterMotion {
  /** Planar speed in world ft/s; 0 when standing still. */
  speed: number;
  /** Gait cycle in radians; advances 2π per `stride` ft travelled. */
  gaitPhase: number;
  /** Clock time (R3F clock.elapsedTime, s) the last jump started, or null. */
  jumpAt: number | null;
  /** Clock time a drag ended and the landing began, or null. */
  landAt: number | null;
  /** Drag velocity along the character's own x axis, world ft/s (+ = toward its right). */
  dragVelocityX: number;
}

export function createMotion(): CharacterMotion {
  return { speed: 0, gaitPhase: 0, jumpAt: null, landAt: null, dragVelocityX: 0 };
}

export interface ArmPose {
  /** Sideways raise in radians, mirrored per side: ~0.28 hangs at rest, ~2.3 is overhead. */
  raise: number;
  /** Forward swing in radians (+ reaches forward). */
  swing: number;
}

export interface FootPose {
  /** Height off the floor. */
  lift: number;
  /** Toe pitch in radians (+ toe up). */
  pitch: number;
  /** Forward offset (+ toward the character's front). */
  forward: number;
}

export type MouthShape = "smile" | "open" | "worried";

export interface Pose {
  /** Whole-body height off the floor. */
  lift: number;
  /** Vertical scale, volume-preserving (< 1 squash, > 1 stretch). */
  squash: number;
  /** Side roll in radians. */
  lean: number;
  /** Forward pitch in radians (+ nods forward). */
  nod: number;
  /** Upper-body yaw in radians (head shakes, looking round). Sprung. */
  twist: number;
  /** Whole-body yaw in radians applied directly, not sprung (celebration spins). */
  spin: number;
  armLeft: ArmPose;
  armRight: ArmPose;
  footLeft: FootPose;
  footRight: FootPose;
  mouth: MouthShape;
  /** Open-mouth amount, 0..1. */
  mouthOpen: number;
  /** Added to the vertical gaze, -1..1 (+ looks up). */
  eyeLift: number;
  /** Body emissive intensity. */
  glow: number;
}

export function createPose(): Pose {
  return {
    lift: 0,
    squash: 1,
    lean: 0,
    nod: 0,
    twist: 0,
    spin: 0,
    armLeft: { raise: 0.28, swing: 0 },
    armRight: { raise: 0.28, swing: 0 },
    footLeft: { lift: 0, pitch: 0, forward: 0 },
    footRight: { lift: 0, pitch: 0, forward: 0 },
    mouth: "smile",
    mouthOpen: 0,
    eyeLift: 0,
    glow: 0.025,
  };
}

export interface PoseInput {
  mood: SpriteMood;
  character: CharacterConfig;
  /** Seconds since mount, already offset by character.phase. */
  time: number;
  /** Seconds spent in the current mood. */
  sinceMood: number;
  /** From CharacterMotion. */
  speed: number;
  gaitPhase: number;
  /** Seconds since the jump / landing started; Infinity when none. */
  sinceJump: number;
  sinceLand: number;
  dragVelocityX: number;
}

const NEUTRAL = createPose();

/** Writes the target pose into `out` and returns it. */
export function poseFor(_input: PoseInput, out: Pose = createPose()): Pose {
  // Stub until the pose track lands: a neutral stance.
  Object.assign(out, NEUTRAL, {
    armLeft: Object.assign(out.armLeft, NEUTRAL.armLeft),
    armRight: Object.assign(out.armRight, NEUTRAL.armRight),
    footLeft: Object.assign(out.footLeft, NEUTRAL.footLeft),
    footRight: Object.assign(out.footRight, NEUTRAL.footRight),
  });
  return out;
}
