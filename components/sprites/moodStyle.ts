import type { ConflictAttribution, SpriteMood, StagePhase } from "@/types/stage";

// Mood → stage dials. SpriteToken damps its refs toward these every frame: how big the sprite
// stands, how fast its icons orbit and its floor aura reads, which way it faces, and its
// rim-flash/trail/sparkle accents. Body acting (arms, feet, gait, jumps, landings) lives in
// characterPose.ts instead. Pure so it is unit-tested.

export type Facing = "camera" | "hearth" | "item";

export interface MoodStyle {
  scale: number;
  /** Orbiting icons, radians per second. */
  orbitSpeed: number;
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
  scale: 1,
  orbitSpeed: 0.6,
  rimFlash: 0,
  aura: 0.45,
  facing: "camera",
  trail: false,
  sparkles: false,
};

const HOVER: Partial<MoodStyle> = { scale: 1.1, aura: 1, facing: "camera" };
const HELD: Partial<MoodStyle> = { scale: 1.2, aura: 1, trail: true, facing: "camera" };

const STYLES: Record<SpriteMood, MoodStyle> = {
  idle: BASE,
  hovered: { ...BASE, ...HOVER },
  held: { ...BASE, ...HELD },
  seated: { ...BASE, aura: 0.85, facing: "hearth" },
  listening: { ...BASE, orbitSpeed: 0.4, aura: 0.85, facing: "hearth" },
  thinking: { ...BASE, orbitSpeed: 2.8, aura: 0.85, facing: "hearth" },
  speaking: { ...BASE, aura: 1 },
  vetoing: { ...BASE, scale: 1.08, rimFlash: 1, aura: 1, facing: "item" },
  conceding: { ...BASE, scale: 0.92, orbitSpeed: 0.25, aura: 0.6, facing: "hearth" },
  scoring: { ...BASE, orbitSpeed: 1.2, aura: 0.85, facing: "hearth" },
  happy: { ...BASE, scale: 1.05, orbitSpeed: 1.2, aura: 1 },
  sad: { ...BASE, scale: 0.95, orbitSpeed: 0.2, aura: 0.4 },
  celebrating: { ...BASE, scale: 1.1, orbitSpeed: 3, aura: 1, sparkles: true },
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
    out.aura = 1;
    out.trail = true;
    out.facing = "camera";
  } else if (hovered) {
    out.scale = style.scale * HOVER.scale!;
    out.aura = 1;
    out.facing = "camera";
  }
  return out;
}
