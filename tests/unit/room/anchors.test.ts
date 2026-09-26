import { describe, expect, it } from "vitest";
import transcript from "@/data/cached-transcript.json";
import {
  ANCHOR_COUNT,
  allocateAnchors,
  anchorName,
  foliageRadiusAt,
  proceduralAnchorPositions,
  treeProfile,
} from "@/components/stage/tree/anchors";
import { CATALOG, findCatalogItem } from "@/components/stage/tree/catalog";
import type { Bundle, CouncilEvent } from "@/types/domain";

const demoBundle = (transcript as CouncilEvent[]).find((event) => event.type === "bundle")!.payload as Bundle;

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});
}

describe("allocateAnchors", () => {
  it("splits the 12 anchors evenly across the demo bundle's three ornament sets", () => {
    const assignments = allocateAnchors(demoBundle);
    expect(assignments).toHaveLength(ANCHOR_COUNT);
    expect(countBy(assignments.map((a) => a.itemId))).toEqual({ "orn-doll": 4, "orn-dino": 4, "orn-gold": 4 });
    expect(assignments.map((a) => a.anchor)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("launches each set from the sprite it serves", () => {
    const bySet = Object.fromEntries(allocateAnchors(demoBundle).map((a) => [a.itemId, a.spriteId]));
    expect(bySet).toEqual({ "orn-doll": "daughter", "orn-dino": "son", "orn-gold": "wife" });
  });

  it("interleaves sets so consecutive flights come from different sprites", () => {
    const assignments = allocateAnchors(demoBundle);
    for (let i = 1; i < assignments.length; i += 1) {
      expect(assignments[i].itemId).not.toBe(assignments[i - 1].itemId);
    }
  });

  it("ignores non-ornament items and handles bundles without ornaments", () => {
    const treeOnly = { items: demoBundle.items.filter((item) => item.slot !== "ornaments"), serves: {} };
    expect(allocateAnchors(treeOnly)).toEqual([]);
  });

  it("gives uneven remainders to the first sets", () => {
    const glass = findCatalogItem("orn-glass")!;
    const bundle = { items: [...demoBundle.items, glass, { ...glass, id: "orn-extra" }], serves: demoBundle.serves };
    const counts = countBy(allocateAnchors(bundle).map((a) => a.itemId));
    expect(Object.values(counts).sort()).toEqual([2, 2, 2, 3, 3]);
    expect(allocateAnchors(bundle).find((a) => a.itemId === "orn-glass")?.spriteId).toBeNull();
  });

  it("keeps unchanged sets on their anchors when a revised bundle swaps one set", () => {
    const first = allocateAnchors(demoBundle);
    const glass = findCatalogItem("orn-glass")!;
    const revised: Bundle = {
      ...demoBundle,
      items: [...demoBundle.items.filter((item) => item.id !== "orn-doll"), glass],
      serves: { ...demoBundle.serves, daughter: ["orn-glass", "topper-star"] },
    };
    const second = allocateAnchors(revised, ANCHOR_COUNT, first);
    for (const assignment of second) {
      const before = first.find((a) => a.anchor === assignment.anchor)!;
      expect(assignment.itemId).toBe(before.itemId === "orn-doll" ? "orn-glass" : before.itemId);
    }
    expect(second.find((a) => a.itemId === "orn-glass")?.spriteId).toBe("daughter");
  });
});

describe("procedural anchors", () => {
  it("names anchors like the GLB nodes", () => {
    expect(anchorName(1)).toBe("ornament_01");
    expect(anchorName(12)).toBe("ornament_12");
  });

  it("places 12 anchors on the foliage of a 4 ft tree, below its tip", () => {
    const heightFt = CATALOG.find((item) => item.id === "tree-4ft")!.heightIn! / 12;
    const profile = treeProfile(heightFt);
    const anchors = proceduralAnchorPositions(heightFt);
    expect(anchors).toHaveLength(12);
    for (const [x, y, z] of anchors) {
      expect(y).toBeGreaterThan(profile.foliageBottom);
      expect(y).toBeLessThan(profile.foliageTop);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(foliageRadiusAt(profile, y) + 0.1);
    }
  });
});
