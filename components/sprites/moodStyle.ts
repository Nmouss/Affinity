import type { ConflictAttribution, SpriteMood, StagePhase } from "@/types/stage";

// Mood → animation targets. SpriteToken damps its refs toward these every frame, so every reaction
// is motion, scale, and color on the same few dials. Pure so it is unit-tested.

export type Facing = "camera" | "hearth" | "item";

export interface MoodStyle {
  /** MeshDistortMaterial distort, the "thinking" dial. */
  distort: number;
  /** How fast the distortion churns. */
  speed: number;
  scale: number;
  /** Bounce height in ft and its rate in bounces per second. */
  bounce: number;
  bounceRate: number;
  /** Multiplier on the core color's saturation. */
  saturation: number;
  /** Multiplier on emissive glow. */
  brightness: number;
  /** Orbiting icons, radians per second. */
  orbitSpeed: number;
  /** Core breathing amplitude (fraction of scale). */
  pulse: number;
  /** 0..1: sinks and hangs forward. */
  droop: number;
  /** Side-to-side roll in radians. */
  wobble: number;
  /** Repeated jump height in ft. */
  jump: number;
  /** Forward lean in radians. */
  lean: number;
  /** Small friendly sway in radians. */
  wave: number;
  /** 0..1 red rim flash. */
  rimFlash: number;
  /** Floor aura brightness, 0..1. */
  aura: number;
  facing: Facing;
  trail: boolean;
  sparkles: boolean;
}

export const SPRITE_MOODS: readonly SpriteMood[] = [
  "idle",
  "hovered",
  "held",
  "seated",
  "thinking",
  "speaking",
  "listening",
  "vetoing",
  "conceding",
  "scoring",
  "happy",
  "sad",
  "celebrating",
];

const BASE: MoodStyle = {
  distort: 0.22,
  speed: 1.5,
  scale: 1,
  bounce: 0.05,
  bounceRate: 0.6,
  saturation: 1,
  brightness: 1,
  orbitSpeed: 0.6,
  pulse: 0,
  droop: 0,
  wobble: 0,
  jump: 0,
  lean: 0,
  wave: 0,
  rimFlash: 0,
  aura: 0.45,
  facing: "camera",
  trail: false,
  sparkles: false,
};

const HOVER: Partial<MoodStyle> = { scale: 1.1, brightness: 1.35, lean: 0.25, wave: 0.12, aura: 1, facing: "camera" };
const HELD: Partial<MoodStyle> = { scale: 1.2, brightness: 1.45, distort: 0.32, aura: 1, trail: true, facing: "camera" };

const STYLES: Record<SpriteMood, MoodStyle> = {
  idle: BASE,
  hovered: { ...BASE, ...HOVER },
  held: { ...BASE, ...HELD, bounce: 0.02 },
  seated: { ...BASE, aura: 0.85, facing: "hearth" },
  listening: { ...BASE, distort: 0.18, orbitSpeed: 0.4, aura: 0.85, facing: "hearth" },
  thinking: { ...BASE, distort: 0.5, speed: 4, orbitSpeed: 2.8, pulse: 0.05, aura: 0.85, facing: "hearth" },
  speaking: { ...BASE, distort: 0.3, speed: 2.5, bounce: 0.18, bounceRate: 2.2, brightness: 1.25, aura: 1 },
  vetoing: { ...BASE, distort: 0.38, speed: 3, scale: 1.08, brightness: 1.3, rimFlash: 1, aura: 1, facing: "item" },
  conceding: {
    ...BASE,
    scale: 0.92,
    bounce: 0.02,
    saturation: 0.6,
    brightness: 0.7,
    orbitSpeed: 0.25,
    droop: 1,
    aura: 0.6,
    facing: "hearth",
  },
  scoring: { ...BASE, distort: 0.32, speed: 2.2, orbitSpeed: 1.2, wobble: 0.18, aura: 0.85, facing: "hearth" },
  happy: { ...BASE, scale: 1.05, bounce: 0.22, bounceRate: 1.6, saturation: 1.35, brightness: 1.35, orbitSpeed: 1.2, aura: 1 },
  sad: { ...BASE, scale: 0.95, bounce: 0.02, saturation: 0.4, brightness: 0.6, orbitSpeed: 0.2, droop: 0.8, aura: 0.4 },
  celebrating: {
    ...BASE,
    scale: 1.1,
    distort: 0.3,
    speed: 3,
    jump: 0.9,
    bounceRate: 1.4,
    saturation: 1.4,
    brightness: 1.6,
    orbitSpeed: 3,
    aura: 1,
    sparkles: true,
  },
};

export function moodStyle(mood: SpriteMood): MoodStyle {
  return STYLES[mood] ?? BASE;
}

export interface MoodInput {
  id: string;
  /** What the director stored in sprites[id].mood. */
  mood: SpriteMood;
  phase: StagePhase;
  conflict: ConflictAttribution | null;
  /** True while this sprite's bubble is still typing out. */
  typing: boolean;
}

/** The mood a sprite shows, layering the phase and conflict beat over the stored mood. */
export function resolveMood({ id, mood, phase, conflict, typing }: MoodInput): SpriteMood {
  if (phase === "receipt") return "celebrating";
  if (phase === "conflict" && conflict) {
    if (conflict.ruleBy === id) return "vetoing";
    if (conflict.wishBy === id) return "conceding";
  }
  // The stored mood stays "speaking" after an opinion lands; once the words are out, the sprite listens.
  if (mood === "speaking" && !typing) return "listening";
  return mood;
}

export interface Overlays {
  hovered: boolean;
  held: boolean;
}

/** Hover and hold stack on top of whatever mood the sprite is in. Writes into `out` to avoid per-frame allocation. */
export function applyOverlays(style: MoodStyle, { hovered, held }: Overlays, out: MoodStyle = { ...style }): MoodStyle {
  Object.assign(out, style);
  if (held) {
    out.scale = style.scale * HELD.scale!;
    out.brightness = Math.max(style.brightness, HELD.brightness!);
    out.distort = Math.max(style.distort, HELD.distort!);
    out.aura = 1;
    out.trail = true;
    out.droop = 0;
    out.facing = "camera";
  } else if (hovered) {
    out.scale = style.scale * HOVER.scale!;
    out.brightness = Math.max(style.brightness, HOVER.brightness!);
    out.lean = HOVER.lean!;
    out.wave = HOVER.wave!;
    out.aura = 1;
    out.facing = "camera";
  }
  return out;
}
