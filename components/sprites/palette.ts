import { Color } from "three";

// Token colors from the profile's two-color palette.

const scratch = { h: 0, s: 0, l: 0 };

function lightness(hex: string): number {
  return new Color(hex).getHSL(scratch).l;
}

/** The darker of the two colors, readable as text and borders (Maya's gold, Ava's pink, Leo's green). */
export function accentColor(colors: readonly string[]): string {
  const [a = "#ffd18a", b = a] = colors;
  return lightness(b) < lightness(a) ? b : a;
}

export function coreColor(colors: readonly string[]): string {
  return colors[0] ?? "#ffffff";
}

export function rimColor(colors: readonly string[]): string {
  return colors[1] ?? colors[0] ?? "#ffd18a";
}
