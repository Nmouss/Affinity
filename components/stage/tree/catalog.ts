import catalogJson from "@/data/catalog.json";
import type { CatalogItem, ConstraintSet, HouseRule, SpriteOpinion } from "@/types/domain";

// Pure catalog and rule helpers for the tree corner. No three.js or React, so they are unit-tested.

export const CATALOG = catalogJson as CatalogItem[];

export function findCatalogItem(id: string | null | undefined, catalog: CatalogItem[] = CATALOG): CatalogItem | null {
  if (!id) return null;
  return catalog.find((item) => item.id === id) ?? null;
}

/** 1 world unit = 1 ft, so catalog heights convert straight to scene units. */
export function inchesToFeet(inches: number): number {
  return inches / 12;
}

/** The tree's true height in ft, falling back to the catalog entry, then to 4 ft. */
export function treeHeightFt(item: CatalogItem, catalog: CatalogItem[] = CATALOG): number {
  const inches = item.heightIn ?? findCatalogItem(item.id, catalog)?.heightIn ?? 48;
  return inchesToFeet(inches);
}

/**
 * The household rules in force. The merged constraint set wins once it exists; before that (and in
 * transcripts that skip the constraints event) the rules come straight from the sprites' opinions.
 */
export function effectiveHardRules(
  constraints: ConstraintSet | null,
  opinions: Record<string, SpriteOpinion>,
): HouseRule[] {
  if (constraints) return constraints.hardRules;
  return Object.values(opinions).flatMap((opinion) => opinion.hardRules);
}

/** The strictest maxHeight rule, in inches, or null when there is none. */
export function maxHeightInches(rules: HouseRule[]): number | null {
  const limits = rules
    .filter((rule) => rule.type === "maxHeight" && typeof rule.inches === "number")
    .map((rule) => rule.inches as number);
  return limits.length > 0 ? Math.min(...limits) : null;
}

/** Catalog trees the height rule rules out, shortest first (tree-6ft and tree-75ft for 48 in). */
export function deriveDecoys(catalog: CatalogItem[], hardRules: HouseRule[]): CatalogItem[] {
  const limit = maxHeightInches(hardRules);
  if (limit === null) return [];
  return catalog
    .filter((item) => item.slot === "tree" && (item.heightIn ?? 0) > limit)
    .sort((a, b) => (a.heightIn ?? 0) - (b.heightIn ?? 0));
}

/** The sprite whose opinion carried the strictest height rule, for attribution labels. */
export function heightRuleAuthor(opinions: Record<string, SpriteOpinion>, inches: number | null): string | null {
  if (inches === null) return null;
  const author = Object.values(opinions).find((opinion) =>
    opinion.hardRules.some((rule) => rule.type === "maxHeight" && rule.inches === inches),
  );
  return author?.spriteId ?? null;
}

const STOPWORDS = new Set(["a", "an", "the", "of", "or", "and", "at", "least", "use", "instead", "some", "lots", "set", "ft", "in", "inch"]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/-/g, "")
    .split(/[^a-z0-9]+/)
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));
}

function overlapScore(text: string, item: CatalogItem): number {
  const haystack = new Set(tokens(`${item.name} ${item.tags.join(" ")}`));
  return tokens(text).filter((word) => haystack.has(word)).length;
}

/** Best token overlap between free text and a pool of catalog items; ties keep catalog order. */
export function bestTextMatch(text: string, pool: CatalogItem[]): CatalogItem | null {
  let best: CatalogItem | null = null;
  let bestScore = 0;
  for (const item of pool) {
    const score = overlapScore(text, item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The catalog item a veto's wish refers to. Decoys are checked first because vetoed wishes are what
 * the decoy slot exists for ("8 ft inflatable T-rex" → inflatable-trex).
 */
export function matchVetoItem(catalog: CatalogItem[], wish: string): CatalogItem | null {
  return bestTextMatch(wish, catalog.filter((item) => item.slot === "decoy")) ?? bestTextMatch(wish, catalog);
}

/** The ornament set a veto resolves into ("Use dinosaur ornaments instead." → orn-dino). */
export function matchResolutionItem(catalog: CatalogItem[], resolution: string): CatalogItem | null {
  return bestTextMatch(resolution, catalog.filter((item) => item.slot === "ornaments"));
}

/** The sprite whose wishes best match a vetoed item (Leo for the T-rex), for attribution labels. */
export function wishAuthor(opinions: Record<string, SpriteOpinion>, item: CatalogItem): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const opinion of Object.values(opinions)) {
    const score = overlapScore(opinion.wishes.join(" "), item);
    if (score > bestScore) {
      best = opinion.spriteId;
      bestScore = score;
    }
  }
  return best;
}

export interface VetoSubject {
  itemId: string;
  resolvedItemId: string;
}

/** Director attribution wins; otherwise the veto text is matched against the catalog. */
export function resolveVetoSubject(
  attribution: { itemId: string | null; resolvedItemId: string | null } | null,
  veto: { wish: string; resolution: string },
  catalog: CatalogItem[] = CATALOG,
): VetoSubject {
  return {
    itemId: attribution?.itemId ?? matchVetoItem(catalog, veto.wish)?.id ?? "inflatable-trex",
    resolvedItemId:
      attribution?.resolvedItemId ?? matchResolutionItem(catalog, veto.resolution)?.id ?? "orn-dino",
  };
}

function describe(item: CatalogItem): string {
  return `${item.id} ${item.name} ${item.tags.join(" ")}`.toLowerCase();
}

export function isDinoItem(item: CatalogItem): boolean {
  return /dino|t-?rex/.test(describe(item));
}

export type OrnamentKind = "bauble" | "dino";

export interface OrnamentStyle {
  kind: OrnamentKind;
  /** Alternated across the set's ornaments. */
  colors: string[];
  metalness: number;
  roughness: number;
  opacity: number;
  /** Emissive glow multiplier, for sparkle. */
  glow: number;
}

/** How an ornament set looks, read from its name and tags. */
export function ornamentStyle(item: CatalogItem): OrnamentStyle {
  const text = describe(item);
  if (isDinoItem(item)) {
    return { kind: "dino", colors: ["#8dff5a", "#4aa3ff"], metalness: 0.1, roughness: 0.45, opacity: 1, glow: 0.45 };
  }
  if (text.includes("glass")) {
    return { kind: "bauble", colors: ["#dff4ff", "#f4fbff"], metalness: 0.2, roughness: 0.05, opacity: 0.45, glow: 0.1 };
  }
  if (text.includes("doll") || text.includes("pink")) {
    return { kind: "bauble", colors: ["#ff6fbf", "#ffb3de"], metalness: 0.35, roughness: 0.3, opacity: 1, glow: 0.35 };
  }
  if (text.includes("gold") || text.includes("white")) {
    return { kind: "bauble", colors: ["#e7b547", "#fff3dc"], metalness: 0.85, roughness: 0.25, opacity: 1, glow: 0.12 };
  }
  return { kind: "bauble", colors: ["#d63a3a", "#f2d0a0"], metalness: 0.5, roughness: 0.3, opacity: 1, glow: 0.1 };
}

export type LightsStyle = "warm" | "multi";

/** Bulb palette for the tree: multicolor when the bundle's lights are color-changing. */
export function lightsStyle(items: CatalogItem[]): LightsStyle {
  const lights = items.find((item) => item.slot === "lights");
  return lights && /color/.test(describe(lights)) ? "multi" : "warm";
}

export type TopperKind = "star" | "bow" | "dino";

export function topperKind(item: CatalogItem): TopperKind {
  if (isDinoItem(item)) return "dino";
  if (/bow|pink/.test(describe(item))) return "bow";
  return "star";
}
