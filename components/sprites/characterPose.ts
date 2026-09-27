import type { SpriteMood } from "@/types/stage";
import type { AccessoryType, CharacterLook } from "@/types/character";

// Mood + locomotion → joint targets for CharacterModel. Pure (no three.js) so it is unit-tested,
// and it writes into a reused Pose so nothing allocates per frame. CharacterModel springs every
// value; SpriteToken fills CharacterMotion as the character walks, jumps, and is dragged.
// Units are the unscaled model's (soles at y = 0, head top at MODEL_HEIGHT) unless noted.

// Widened to the full People Maker accessory set. CharacterModel is the only reader, and every
// value CHARACTERS uses today ("scarf" | "bow" | "dinosaur") is still a member of AccessoryType.
export type Accessory = AccessoryType;
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
  wife: { accessory: "none", scale: 0.95, width: 1.01, energy: 0.72, phase: 0, stride: 1.3, walkSpeed: 3.2, bounce: 0.03, fidget: "sway" },
  daughter: { accessory: "none", scale: 0.95, width: 1.01, energy: 0.85, phase: 3.3, stride: 1.3, walkSpeed: 3.2, bounce: 0.035, fidget: "sway" },
  son: { accessory: "none", scale: 0.95, width: 1.03, energy: 0.9, phase: 1.6, stride: 1.3, walkSpeed: 3.2, bounce: 0.04, fidget: "sway" },
};

export function characterFor(id: string): CharacterConfig {
  return CHARACTERS[id] ?? CHARACTERS.daughter!;
}

function clamp01Range(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Deterministic 0..4 (seconds) spread from an id's characters, so people never move in lockstep. */
function hashPhase(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return ((hash % 1000) / 1000) * 4;
}

/**
 * Derives a CharacterConfig straight from a People Maker CharacterLook, replacing the old
 * hard-coded-by-id CHARACTERS lookup for anyone rendered from a look. `id` only seeds the phase
 * hash (so two people with an identical look still move out of step).
 *
 * scale/width are tuned so the three STARTER_LOOKS land within ±0.015 of today's CHARACTERS
 * scale/width (adult friends at height 1).
 */
export function characterForLook(look: CharacterLook, id: string): CharacterConfig {
  const { height, build } = look.body;

  const scale = 0.72 + 0.23 * height;
  const width = 0.9 + 0.2 * build;

  // Smaller and rounder people read as more energetic (bouncier idle fidgets, bigger gestures).
  const smallness = 1 - height;
  const roundness = build;
  const energy = clamp01Range(0.7 + 0.5 * smallness + 0.1 * (roundness - 0.5), 0.65, 1.25);

  // Shorter legs take shorter steps; because walkSpeed shrinks slower than stride does, cadence
  // (walkSpeed / stride, in the gait-phase math SpriteToken drives from these) still comes out
  // faster for a little one than for a grown-up.
  const stride = 0.85 + 0.45 * height;
  const walkSpeed = 4.2 - 1 * height;

  const energyNorm = clamp01Range((energy - 0.7) / 0.5, 0, 1);
  const bounce = clamp01Range(0.03 + 0.02 * energyNorm, 0.03, 0.05);

  const fidget: Fidget =
    look.accessory.type === "scarf" ? "scarfTug" : height < 0.65 ? "toeBounce" : "sway";

  return {
    accessory: look.accessory.type,
    scale,
    width,
    energy,
    phase: hashPhase(id),
    stride,
    walkSpeed,
    bounce,
    fidget,
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const k = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return k * k * (3 - 2 * k);
}

/** A bell curve centered at `at`, 1 at the peak, narrowed by `width`. */
function pulse(t: number, at: number, width: number): number {
  return Math.exp(-1 * ((t - at) / width) ** 2);
}

/** Resets `out` to the neutral stance in place, without replacing its nested objects. */
function resetPose(out: Pose): void {
  out.lift = 0;
  out.squash = 1;
  out.lean = 0;
  out.nod = 0;
  out.twist = 0;
  out.spin = 0;
  out.armLeft.raise = 0.28;
  out.armLeft.swing = 0;
  out.armRight.raise = 0.28;
  out.armRight.swing = 0;
  out.footLeft.lift = 0;
  out.footLeft.pitch = 0;
  out.footLeft.forward = 0;
  out.footRight.lift = 0;
  out.footRight.pitch = 0;
  out.footRight.forward = 0;
  out.mouth = "smile";
  out.mouthOpen = 0;
  out.eyeLift = 0;
  out.glow = 0.025;
}

// --- Mood acting -------------------------------------------------------------------------------

function poseIdle(input: PoseInput, out: Pose, t: number): void {
  const { character } = input;
  // Breathing squash, always running.
  out.squash += Math.sin(t * 1.5) * 0.01;
  out.lean += Math.sin(t * 0.9) * 0.013;

  // Slow weight shift: alternate a hair of lift off one foot every couple seconds.
  const shift = Math.sin(t * 0.6);
  out.footLeft.lift += Math.max(0, shift) * 0.012;
  out.footRight.lift += Math.max(0, -shift) * 0.012;

  switch (character.fidget) {
    case "toeBounce": {
      // Quick rises on the toes: heel lifts (pitch), the body follows with a small bob.
      const rise = pulse(t % 2.4, 1.2, 0.22);
      out.footLeft.pitch -= 0.3 * rise;
      out.footRight.pitch -= 0.3 * rise;
      out.lift += 0.015 * rise;
      break;
    }
    case "sway": {
      const swayAmount = Math.sin(t * 0.7);
      out.lean += swayAmount * 0.09;
      const loosen = Math.abs(swayAmount) * 0.06;
      out.armLeft.raise = Math.max(0.1, out.armLeft.raise - loosen);
      out.armRight.raise = Math.max(0.1, out.armRight.raise - loosen);
      break;
    }
    case "scarfTug": {
      const tug = pulse(t % 3.4, 1.4, 0.5);
      out.armRight.raise += 1.12 * tug;
      out.armRight.swing += 0.35 * tug;
      break;
    }
  }
}

function poseHovered(_input: PoseInput, out: Pose, since: number): void {
  // Perk-up stretch right on entry, then settle into a wave.
  out.squash = 1 + 0.12 * pulse(since, 0.12, 0.15);
  out.armRight.raise = 2.28 + Math.sin(since * 9) * 0.16;
  out.lean = -0.035;
}

function poseHeld(input: PoseInput, out: Pose, t: number): void {
  const { character, dragVelocityX } = input;
  out.squash = 1.06;

  // Feet pedal out of phase, fast.
  const pedal = t * 6;
  const leftPedal = Math.max(0, Math.sin(pedal));
  const rightPedal = Math.max(0, Math.sin(pedal + Math.PI));
  out.footLeft.lift = leftPedal * 0.1;
  out.footLeft.pitch = Math.sin(pedal) * 0.4;
  out.footRight.lift = rightPedal * 0.1;
  out.footRight.pitch = Math.sin(pedal + Math.PI) * 0.4;

  // Arms flail up, roughly opposite each other.
  out.armLeft.raise = 0.95 + Math.sin(t * 7) * 0.25 * character.energy;
  out.armRight.raise = 0.95 + Math.sin(t * 7 + Math.PI) * 0.25 * character.energy;

  // Lean against the drag.
  out.lean = clamp(-dragVelocityX * 0.15, -0.35, 0.35);
}

function poseSettled(_input: PoseInput, out: Pose, since: number): void {
  // Settle squash dip on arrival, then a head tilt with periodic nods.
  const settling = 1 - smoothstep(0, 0.4, since);
  out.squash = 1 - 0.06 * settling;
  out.lean = -0.035;
  out.nod = 0.045 + 0.1 * pulse(since % 3.8, 2.9, 0.2);
}

function poseThinking(_input: PoseInput, out: Pose, t: number): void {
  out.armRight.raise = 2.3;
  out.armRight.swing = -0.28;
  // A foot tap at roughly 2Hz.
  const tap = Math.max(0, Math.sin(t * Math.PI * 4));
  out.footRight.pitch = tap * 0.5;
  out.footRight.lift = tap * 0.08;
  out.eyeLift = 0.5;
  out.lean = -0.07;
}

function poseSpeaking(input: PoseInput, out: Pose, since: number): void {
  const { character } = input;
  // Leo talks a touch faster than the rest of the family.
  const rate = character.fidget === "toeBounce" ? 1.1 : 0.9;
  const period = 3.8;
  const beat = (since * rate) % period;
  const emphasisPulse = pulse(beat, 0.65, 0.32);
  const phrase = emphasisPulse + 0.65 * pulse(beat, 1.65, 0.27) + 0.4 * pulse(beat, 2.35, 0.19);

  // Alternate the gesturing hand every phrase cycle.
  const cycle = Math.floor((since * rate) / period);
  const rightGestures = cycle % 2 === 0;
  const gestureRaise = 0.45 + phrase * 0.82 * character.energy;
  const restRaise = 0.28 + phrase * 0.05;
  if (rightGestures) {
    out.armRight.raise = gestureRaise;
    out.armRight.swing = phrase * 0.25;
    out.armLeft.raise = restRaise;
  } else {
    out.armLeft.raise = gestureRaise;
    out.armLeft.swing = phrase * 0.25;
    out.armRight.raise = restRaise;
  }

  out.nod = phrase * 0.035 * character.energy;
  out.lean = -0.018 + phrase * 0.03;
  out.squash += phrase * 0.012;

  const syllable = Math.max(0, Math.sin(since * 13)) * phrase;
  if (syllable > 0.13) {
    out.mouth = "open";
    out.mouthOpen = Math.min(1, syllable);
  }

  // A small emphasis step on the biggest pulse, on the gesturing side's foot.
  const emphasisFoot = rightGestures ? out.footRight : out.footLeft;
  emphasisFoot.forward += emphasisPulse * 0.12;
  emphasisFoot.lift += emphasisPulse * 0.06;
}

function poseVetoing(_input: PoseInput, out: Pose, since: number): void {
  const stompWindow = 0.35;
  if (since < stompWindow) {
    // Lift then slam: up over the first half of the window, down over the second.
    const rise = smoothstep(0, stompWindow * 0.45, since);
    const fall = smoothstep(stompWindow * 0.45, stompWindow, since);
    out.footRight.lift = Math.max(0, rise - fall) * 0.25;
    out.squash = 1 - 0.1 * pulse(since, stompWindow, 0.08);
  }
  // A flat "stop" arm forward, easing in.
  const armIn = smoothstep(0, 0.3, since);
  out.armRight.raise = 0.28 + (1.4 - 0.28) * armIn;
  out.armRight.swing = 1.3 * armIn;
  // Head shake, fading in.
  const fadeIn = smoothstep(0, 0.5, since);
  out.twist = Math.sin(since * 9) * 0.25 * fadeIn;
  out.glow = 0.08;
}

function poseSlumped(_input: PoseInput, out: Pose, t: number): void {
  const sigh = Math.sin(t * 0.8);
  out.nod = 0.12 + 0.02 * sigh;
  out.squash = 0.96 + 0.015 * sigh;
  out.armLeft.raise = 0.12;
  out.armRight.raise = 0.12;
  out.mouth = "worried";
  out.eyeLift = -0.35;
}

function poseScoring(_input: PoseInput, out: Pose, t: number): void {
  out.lean = Math.sin(t * Math.PI * 3) * 0.08;
  out.armLeft.raise = 0.9;
  out.armRight.raise = 0.9;
}

function poseHappy(input: PoseInput, out: Pose, since: number): void {
  const { character } = input;
  const period = 1.1;
  const local = (since + character.phase * 0.13) % period;
  const up = Math.max(0, Math.sin((local / period) * Math.PI));
  out.lift += up * 0.12 * character.energy;
  out.squash += -0.08 * pulse(local, 0, 0.08) + 0.04 * pulse(local, period * 0.4, 0.15);
  out.armLeft.raise = 2.1 + 0.15 * up;
  out.armRight.raise = 2.1 + 0.25 * up;
  out.glow = 0.12;
}

/**
 * The jump curve: crouch, takeoff, air (tuck), landing, over a 0..1 progress `u` across
 * JUMP_DURATION. Shared by an in-place jump (layer 3 below) and celebrating's jump loop.
 */
function applyJumpArc(out: Pose, u: number, energy: number): void {
  const crouchEnd = 0.18;
  const takeoffEnd = 0.32;
  const airEnd = 0.82;
  if (u < crouchEnd) {
    const k = smoothstep(0, 1, u / crouchEnd);
    out.squash = 1 - 0.15 * k;
    out.lift = 0;
  } else if (u < takeoffEnd) {
    const raw = (u - crouchEnd) / (takeoffEnd - crouchEnd);
    const k = smoothstep(0, 1, raw);
    out.squash = 0.85 + 0.27 * k;
    out.lift = 0.05 * k * raw;
  } else if (u < airEnd) {
    const k = (u - takeoffEnd) / (airEnd - takeoffEnd);
    const arc = Math.sin(k * Math.PI);
    out.lift = arc * 0.55 * energy;
    out.squash = 1;
    out.footLeft.lift = 0.1 * arc;
    out.footLeft.pitch = 0.3 * arc;
    out.footRight.lift = 0.1 * arc;
    out.footRight.pitch = 0.3 * arc;
    out.armLeft.raise = 2.2;
    out.armRight.raise = 2.2;
  } else {
    const raw = (u - airEnd) / (1 - airEnd);
    const k = smoothstep(0, 1, raw);
    out.squash = 0.88 + 0.12 * k;
    out.lift = (1 - k) * 0.05;
    out.armLeft.raise = 2.2 * (1 - k) + 0.28 * k;
    out.armRight.raise = 2.2 * (1 - k) + 0.28 * k;
  }
}

function poseCelebrating(input: PoseInput, out: Pose, t: number): void {
  const { character } = input;
  // `t` already carries character.phase, so the loop is naturally staggered per character.
  const period = 1.6;
  const local = t % period;
  if (local < JUMP_DURATION) {
    const u = local / JUMP_DURATION;
    applyJumpArc(out, u, character.energy);

    // Every third jump, spin fully around across the airborne part, reset on landing.
    const jumpIndex = Math.floor(t / period);
    if (jumpIndex % 3 === 2) {
      const airStart = 0.32;
      const airEnd = 0.82;
      if (u > airStart && u < airEnd) {
        const spinK = (u - airStart) / (airEnd - airStart);
        out.spin = spinK * Math.PI * 2;
      } else if (u >= airEnd) {
        out.spin = 0;
      }
    }
  }
  // Arms stay up throughout the celebration, not just mid-air.
  out.armLeft.raise = Math.max(out.armLeft.raise, 2.1);
  out.armRight.raise = Math.max(out.armRight.raise, 2.1);
  out.glow = 0.12;
}

// --- Walk layer ----------------------------------------------------------------------------

/** Moods where the mood acting above already owns the arms; walking only nudges them there. */
function armsAreOwned(mood: SpriteMood): boolean {
  return mood === "speaking" || mood === "vetoing" || mood === "thinking" || mood === "held" || mood === "celebrating";
}

function applyWalk(input: PoseInput, out: Pose): void {
  const { character, speed, gaitPhase, mood } = input;
  if (mood === "held") return; // being dragged, not walking

  const w = clamp(speed / (0.5 * character.walkSpeed), 0, 1);
  if (w <= 0) return; // standing still contributes nothing at all

  const phi = gaitPhase;
  const stepLift = 0.14;
  const stepForward = 0.12;

  const leftRaw = Math.max(0, Math.sin(phi));
  const rightRaw = Math.max(0, Math.sin(phi + Math.PI));
  const leftForward = Math.cos(phi) * stepForward;
  const rightForward = Math.cos(phi + Math.PI) * stepForward;

  out.footLeft.lift += leftRaw * stepLift * w;
  out.footLeft.pitch += leftRaw * 0.5 * w;
  out.footLeft.forward += leftForward * w;

  out.footRight.lift += rightRaw * stepLift * w;
  out.footRight.pitch += rightRaw * 0.5 * w;
  out.footRight.forward += rightForward * w;

  // Body bobs twice per cycle and rolls toward whichever foot is planted.
  out.lift += Math.abs(Math.sin(phi)) * character.bounce * w;
  out.lean += -Math.sin(phi) * 0.06 * w;

  const armGain = (armsAreOwned(mood) ? 0.3 : 1) * w;
  out.armLeft.swing += -leftForward * armGain;
  out.armRight.swing += -rightForward * armGain;
}

function applyLanding(out: Pose, sinceLand: number): void {
  if (!(sinceLand < LAND_DURATION)) return;
  const ease = 1 - smoothstep(0, LAND_DURATION, sinceLand);
  out.squash = 1 - 0.14 * ease;
  const flare = 0.28 + (1 - 0.28) * ease;
  out.armLeft.raise = flare;
  out.armRight.raise = flare;
}

/** Writes the target pose into `out` and returns it. */
export function poseFor(input: PoseInput, out: Pose = createPose()): Pose {
  resetPose(out);

  const t = input.time;
  const since = input.sinceMood;

  switch (input.mood) {
    case "idle":
      poseIdle(input, out, t);
      break;
    case "hovered":
      poseHovered(input, out, since);
      break;
    case "held":
      poseHeld(input, out, t);
      break;
    case "seated":
    case "listening":
      poseSettled(input, out, since);
      break;
    case "thinking":
      poseThinking(input, out, t);
      break;
    case "speaking":
      poseSpeaking(input, out, since);
      break;
    case "vetoing":
      poseVetoing(input, out, since);
      break;
    case "conceding":
    case "sad":
      poseSlumped(input, out, t);
      break;
    case "scoring":
      poseScoring(input, out, t);
      break;
    case "happy":
      poseHappy(input, out, since);
      break;
    case "celebrating":
      poseCelebrating(input, out, t);
      break;
  }

  applyWalk(input, out);

  if (input.sinceJump < JUMP_DURATION) {
    applyJumpArc(out, input.sinceJump / JUMP_DURATION, input.character.energy);
  }

  applyLanding(out, input.sinceLand);

  return out;
}
