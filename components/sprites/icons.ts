import type { FamilyProfile } from "@/types/domain";

// Picks the low-poly icons that orbit a sprite from the person's `loves`. Pure so it is unit-tested.

export type IconKind = "dino" | "doll" | "star" | "bulb" | "bow" | "bauble" | "snowflake" | "gift";

export interface SpriteIcon {
  kind: IconKind;
  /** The love this icon came from, or "" for padding. */
  love: string;
  /** Color-changing lights cycle their hue instead of glowing warm. */
  rainbow: boolean;
}

export const DEFAULT_ICON: IconKind = "gift";
export const MIN_ICONS = 3;
export const MAX_ICONS = 4;

// First match wins, so the more specific keywords come first.
const KEYWORDS: Array<[RegExp, IconKind[]]> = [
  [/t-?rex|dino/i, ["dino"]],
  [/doll/i, ["doll"]],
  [/sparkl|glitter|shimmer|shiny/i, ["star"]],
  [/light|lamp|glow|candle/i, ["bulb"]],
  [/pink|bow|ribbon/i, ["bow"]],
  [/gold|silver|white|bauble|ornament|decor/i, ["bauble", "star"]],
  [/minimal|simple|clean|snow|winter/i, ["snowflake"]],
  [/star/i, ["star"]],
];

const RAINBOW = /colou?r-?chang|rainbow|multicolou?r|rgb/i;

export function iconsForLove(love: string): IconKind[] {
  for (const [pattern, kinds] of KEYWORDS) {
    if (pattern.test(love)) return kinds;
  }
  return [DEFAULT_ICON];
}

/** 3–4 distinct icons in the order of the person's loves, padded by repeating their first loves. */
export function iconsForProfile(profile: Pick<FamilyProfile, "loves">): SpriteIcon[] {
  const icons: SpriteIcon[] = [];
  for (const love of profile.loves) {
    for (const kind of iconsForLove(love)) {
      if (icons.some((icon) => icon.kind === kind)) continue;
      icons.push({ kind, love, rainbow: kind === "bulb" && RAINBOW.test(love) });
    }
  }
  if (icons.length === 0) icons.push({ kind: DEFAULT_ICON, love: "", rainbow: false });

  const distinct = icons.length;
  for (let i = 0; icons.length < MIN_ICONS; i += 1) icons.push({ ...icons[i % distinct]! });
  return icons.slice(0, MAX_ICONS);
}
