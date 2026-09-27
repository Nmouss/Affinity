import type { CatalogItem, ConstraintSet, FamilyProfile, HouseRule, SpriteOpinion } from "@/types/domain";
import type { ConflictAttribution } from "@/types/stage";

type Veto = ConstraintSet["conflicts"][number];

const STOPWORDS = new Set(["a", "an", "and", "the", "of", "or", "to", "with", "use", "instead", "please", "some", "lots"]);

/** Lowercase word stems; "T-rex" becomes "trex" and plurals lose their trailing s. */
export function tokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/(\w)-(\w)/g, "$1$2")
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
  return new Set(words);
}

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

/** Highest-scoring candidate, or null when nothing overlaps at all. Ties keep the first candidate. */
function best<T>(candidates: T[], score: (candidate: T) => number): T | null {
  let winner: T | null = null;
  let top = 0;
  for (const candidate of candidates) {
    const value = score(candidate);
    if (value > top) {
      top = value;
      winner = candidate;
    }
  }
  return winner;
}

function wishesOf(spriteId: string, opinions: Record<string, SpriteOpinion>, family: FamilyProfile[]): string[] {
  return opinions[spriteId]?.wishes ?? family.find((profile) => profile.id === spriteId)?.loves ?? [];
}

function rulesOf(spriteId: string, opinions: Record<string, SpriteOpinion>, family: FamilyProfile[]): HouseRule[] {
  return opinions[spriteId]?.hardRules ?? family.find((profile) => profile.id === spriteId)?.houseRules ?? [];
}

/** Which HouseRule type a free-text rule like "Maximum height: 48 inches" names. */
export function ruleTypeOf(rule: string): HouseRule["type"] | null {
  if (/maxheight/i.test(rule)) return "maxHeight";
  if (/excludedtag/i.test(rule)) return "excludedTag";
  if (/height|tall|inch|\bft\b|feet|foot/i.test(rule)) return "maxHeight";
  if (/exclude|\bno\b|avoid|tag/i.test(rule)) return "excludedTag";
  return null;
}

function itemTokens(item: CatalogItem): Set<string> {
  return tokens([item.name, ...item.tags].join(" "));
}

/**
 * Who is on each side of a veto. Explicit fields on the payload win; otherwise the wish is matched to
 * the sprite whose wishes share the most words, the rule to the sprite that declared that rule type,
 * and both texts to the closest catalog items.
 */
export function attributeVeto(
  veto: Veto,
  opinions: Record<string, SpriteOpinion>,
  family: FamilyProfile[],
  catalog: CatalogItem[],
): ConflictAttribution {
  const explicit = veto as Veto & Partial<ConflictAttribution>;
  const spriteIds = family.map((profile) => profile.id);
  for (const id of Object.keys(opinions)) if (!spriteIds.includes(id)) spriteIds.push(id);

  const wishTokens = tokens(veto.wish);
  const wishBy =
    explicit.wishBy ??
    best(spriteIds, (id) => Math.max(0, ...wishesOf(id, opinions, family).map((wish) => overlap(wishTokens, tokens(wish)))));

  const ruleType = ruleTypeOf(veto.rule);
  const ruleNumbers: string[] = veto.rule.match(/\d+/g) ?? [];
  const ruleBy =
    explicit.ruleBy ??
    best(spriteIds, (id) => {
      const matching = rulesOf(id, opinions, family).filter((rule) => rule.type === ruleType);
      if (matching.length === 0) return 0;
      const numberMatch = matching.some((rule) => rule.inches !== undefined && ruleNumbers.includes(String(rule.inches)));
      return numberMatch ? 2 : 1;
    });

  const itemId = explicit.itemId ?? best(catalog, (item) => overlap(wishTokens, itemTokens(item)))?.id ?? null;

  const resolutionTokens = tokens(veto.resolution);
  const resolvedItemId =
    explicit.resolvedItemId ??
    best(
      catalog.filter((item) => item.id !== itemId && item.slot !== "decoy"),
      (item) => overlap(resolutionTokens, itemTokens(item)),
    )?.id ??
    null;

  return { wishBy, ruleBy, itemId, resolvedItemId };
}
