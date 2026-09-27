import { describe, expect, it } from "vitest";
import { groupBySlot, pedestalLayout, slotOrder } from "@/components/stage/centerpiece/itemGrouping";
import type { CatalogItem } from "@/types/domain";

function item(id: string, slot: string): CatalogItem {
  return { id, slot, name: id, price: 10, tags: [] };
}

describe("groupBySlot", () => {
  it("groups items by slot, preserving item order within each slot", () => {
    const items = [item("a", "centerpiece"), item("b", "lighting"), item("c", "centerpiece")];
    const groups = groupBySlot(items);
    expect([...groups.keys()]).toEqual(["centerpiece", "lighting"]);
    expect(groups.get("centerpiece")?.map((i) => i.id)).toEqual(["a", "c"]);
    expect(groups.get("lighting")?.map((i) => i.id)).toEqual(["b"]);
  });

  it("returns an empty map for no items", () => {
    expect(groupBySlot([]).size).toBe(0);
  });
});

describe("slotOrder", () => {
  it("returns each distinct slot in first-seen order", () => {
    const items = [item("a", "lighting"), item("b", "centerpiece"), item("c", "lighting")];
    expect(slotOrder(items)).toEqual(["lighting", "centerpiece"]);
  });
});

describe("pedestalLayout", () => {
  it("returns no positions for zero slots", () => {
    expect(pedestalLayout(0)).toEqual([]);
  });

  it("centers a single pedestal at the origin", () => {
    expect(pedestalLayout(1)).toEqual([[0, 0]]);
  });

  it("spreads pedestals symmetrically around the origin", () => {
    const positions = pedestalLayout(3);
    expect(positions).toHaveLength(3);
    expect(positions[1]![0]).toBeCloseTo(0);
    expect(positions[0]![0]).toBeCloseTo(-positions[2]![0]!);
  });
});
