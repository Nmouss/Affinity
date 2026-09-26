// Typewriter timing shared by the DOM bubble (what is shown) and the sprite (bounce while typing).

export const TYPE_CPS = 30;
export const BUBBLE_MAX = 140;

/** Trims long lines at a word boundary so a bubble stays readable from across a table. */
export function clampBubble(text: string, max = BUBBLE_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "")}…`;
}

export function typedLength(text: string, elapsedSeconds: number, cps = TYPE_CPS): number {
  return Math.max(0, Math.min(text.length, Math.floor(elapsedSeconds * cps)));
}

/** Seconds until the (clamped) bubble finishes typing. */
export function typingDuration(text: string | null, cps = TYPE_CPS): number {
  return text ? clampBubble(text).length / cps : 0;
}
