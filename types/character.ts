// How a person looks, edited in the People Maker (/create) and rendered by CharacterModel.
// Part types are small closed sets so every option has a thumbnail and a mesh variant.

export const EYE_TYPES = ["dot", "oval", "sleepy", "sparkle", "wide"] as const;
export const BROW_TYPES = ["none", "soft", "bold", "raised"] as const;
export const MOUTH_TYPES = ["smile", "grin", "o", "flat", "cat"] as const;
export const ACCESSORY_TYPES = ["none", "scarf", "bow", "dinosaur", "glasses", "beanie", "flower", "antenna"] as const;

export type EyeType = (typeof EYE_TYPES)[number];
export type BrowType = (typeof BROW_TYPES)[number];
export type MouthType = (typeof MOUTH_TYPES)[number];
export type AccessoryType = (typeof ACCESSORY_TYPES)[number];

/** Which part of the People Maker's editor a grid of options belongs to. */
export const PART_OPTIONS = {
  eyes: EYE_TYPES,
  brows: BROW_TYPES,
  mouth: MOUTH_TYPES,
  accessory: ACCESSORY_TYPES,
} as const;
export type PartKind = keyof typeof PART_OPTIONS;

/** Mii-style adjust-pad offsets run from -1 to 1 in quarter steps; 0 is the default placement. */
export const ADJUST = { min: -1, max: 1, step: 0.25 } as const;

export interface CharacterLook {
  /** 0..1 each: height from little one to grown-up, build from slim to round. */
  body: { height: number; build: number };
  /** Main body color (the mascot's "shirt"), from FAVORITE_COLORS or any hex. */
  bodyColor: string;
  /** Second color for accessories and trim. */
  accent: string;
  /** Face patch tone, from SKIN_TONES. */
  skin: string;
  /** size, spacing and height are ADJUST offsets. */
  eyes: { type: EyeType; color: string; size: number; spacing: number; height: number };
  brows: { type: BrowType; height: number };
  mouth: { type: MouthType };
  cheeks: { on: boolean; color: string };
  accessory: { type: AccessoryType; color: string };
}

/** Everyone is either family (lives in the living room) or a friend (visits when invited). */
export const CIRCLES = ["family", "friend"] as const;
export type Circle = (typeof CIRCLES)[number];

/** The first "Who is this?" pick after the circle: sets the body preset and the relationship. */
export const BODY_SIZES = ["grownup", "kid", "little"] as const;
export type BodySize = (typeof BODY_SIZES)[number];

export const BODY_PRESETS: Record<BodySize, { height: number; build: number }> = {
  grownup: { height: 1, build: 0.5 },
  kid: { height: 0.6, build: 0.45 },
  little: { height: 0.3, build: 0.6 },
};

/** Mii's twelve favorite colors: the body and accent rows in the Colors tab. */
export const FAVORITE_COLORS = [
  "#e0312b",
  "#f47a20",
  "#f7d63a",
  "#8fd14f",
  "#1f9e4a",
  "#2464c9",
  "#5bc8f0",
  "#ff8fcf",
  "#8a4bc9",
  "#8a5a36",
  "#fff4d6",
  "#2b2b2b",
] as const;

/** Face patch tones; the first is today's cream face. */
export const SKIN_TONES = ["#ffedce", "#ffe3c8", "#f5c9a0", "#e0a878", "#b87a4b", "#8a5634", "#5a3620"] as const;
export const EYE_COLORS = ["#302c2b", "#5a3a22", "#2f5d8a", "#3d7a4a", "#6b6b73", "#7a3fa0"] as const;
