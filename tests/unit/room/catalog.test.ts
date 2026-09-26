import { describe, expect, it } from "vitest";
import transcript from "@/data/cached-transcript.json";
import {
  CATALOG,
  deriveDecoys,
  effectiveHardRules,
  findCatalogItem,
  heightRuleAuthor,
  inchesToFeet,
  lightsStyle,
  matchResolutionItem,
  matchVetoItem,
  maxHeightInches,
  ornamentStyle,
  resolveVetoSubject,
  topperKind,
  treeHeightFt,
} from "@/components/stage/tree/catalog";
import type { CouncilEvent, HouseRule, SpriteOpinion } from "@/types/domain";

const events = transcript as CouncilEvent[];
const veto = events.find((event) => event.type === "veto")!.payload as { rule: string; wish: string; resolution: string };
const opinions = Object.fromEntries(
  events.filter((event) => event.type === "opinion").map((event) => [event.payload.spriteId, event.payload]),
) as Record<string, SpriteOpinion>;
const fourFeet: HouseRule = { type: "maxHeight", inches: 48, why: "The living room is small." };

describe("height conversion", () => {
  it("converts inches to scene feet", () => {
    expect(inchesToFeet(48)).toBe(4);
    expect(inchesToFeet(90)).toBe(7.5);
  });

  it("sizes bundle trees from heightIn, falling back to the catalog", () => {
    expect(treeHeightFt(findCatalogItem("tree-4ft")!)).toBe(4);
    expect(treeHeightFt({ id: "tree-6ft", slot: "tree", name: "6 ft", price: 0, tags: [] })).toBe(6);
    expect(treeHeightFt({ id: "mystery", slot: "tree", name: "?", price: 0, tags: [] })).toBe(4);
  });
});

describe("house rules", () => {
  it("takes rules from opinions until the merged constraints exist", () => {
    expect(effectiveHardRules(null, opinions)).toEqual([fourFeet]);
    expect(effectiveHardRules({ hardRules: [], wishes: [], conflicts: [] }, opinions)).toEqual([]);
  });

  it("uses the strictest maxHeight rule", () => {
    expect(maxHeightInches([])).toBeNull();
    expect(maxHeightInches([{ type: "excludedTag", tag: "giant", why: "" }])).toBeNull();
    expect(maxHeightInches([{ ...fourFeet, inches: 72 }, fourFeet])).toBe(48);
  });

  it("attributes the height rule to Maya", () => {
    expect(heightRuleAuthor(opinions, 48)).toBe("wife");
    expect(heightRuleAuthor(opinions, null)).toBeNull();
  });
});

describe("deriveDecoys", () => {
  it("returns the catalog trees taller than 48 in", () => {
    expect(deriveDecoys(CATALOG, [fourFeet]).map((item) => item.id)).toEqual(["tree-6ft", "tree-75ft"]);
  });

  it("returns nothing without a height rule", () => {
    expect(deriveDecoys(CATALOG, [])).toEqual([]);
  });

  it("never includes non-tree decoys", () => {
    expect(deriveDecoys(CATALOG, [{ ...fourFeet, inches: 30 }]).every((item) => item.slot === "tree")).toBe(true);
  });
});

describe("veto matching", () => {
  it("matches the transcript wish to the inflatable T-rex", () => {
    expect(matchVetoItem(CATALOG, veto.wish)?.id).toBe("inflatable-trex");
    expect(matchVetoItem(CATALOG, "giant inflatable T-rex")?.id).toBe("inflatable-trex");
    expect(matchVetoItem(CATALOG, "a big inflatable Santa")?.id).toBe("inflatable-santa");
  });

  it("falls back to the whole catalog when no decoy matches", () => {
    expect(matchVetoItem(CATALOG, "7.5 ft grand tree")?.id).toBe("tree-75ft");
    expect(matchVetoItem(CATALOG, "xyzzy")).toBeNull();
  });

  it("matches the resolution to the dinosaur ornament set", () => {
    expect(matchResolutionItem(CATALOG, veto.resolution)?.id).toBe("orn-dino");
  });

  it("prefers director attribution and falls back to text matching", () => {
    expect(resolveVetoSubject(null, veto)).toEqual({ itemId: "inflatable-trex", resolvedItemId: "orn-dino" });
    expect(resolveVetoSubject({ itemId: "inflatable-santa", resolvedItemId: "orn-gold" }, veto)).toEqual({
      itemId: "inflatable-santa",
      resolvedItemId: "orn-gold",
    });
    expect(resolveVetoSubject({ itemId: null, resolvedItemId: null }, { wish: "?", resolution: "?" })).toEqual({
      itemId: "inflatable-trex",
      resolvedItemId: "orn-dino",
    });
  });
});

describe("item styling", () => {
  it("styles ornament sets from their tags", () => {
    expect(ornamentStyle(findCatalogItem("orn-dino")!).kind).toBe("dino");
    expect(ornamentStyle(findCatalogItem("orn-doll")!).colors[0]).toBe("#ff6fbf");
    expect(ornamentStyle(findCatalogItem("orn-gold")!).metalness).toBeGreaterThan(0.5);
    expect(ornamentStyle(findCatalogItem("orn-glass")!).opacity).toBeLessThan(1);
  });

  it("uses multicolor bulbs only for color-changing lights", () => {
    expect(lightsStyle([findCatalogItem("lights-color")!])).toBe("multi");
    expect(lightsStyle([findCatalogItem("lights-warm")!])).toBe("warm");
    expect(lightsStyle([])).toBe("warm");
  });

  it("picks the topper shape", () => {
    expect(topperKind(findCatalogItem("topper-star")!)).toBe("star");
    expect(topperKind(findCatalogItem("topper-bow")!)).toBe("bow");
    expect(topperKind(findCatalogItem("topper-dino")!)).toBe("dino");
  });
});
