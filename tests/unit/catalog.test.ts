import { describe, expect, it } from "vitest";
import { searchCatalog } from "@/lib/catalog/search";
import type { CatalogItem } from "@/types/domain";

const CATALOG: CatalogItem[] = [
  { id: "short", slot: "centerpiece", name: "Short piece", price: 40, heightIn: 20, tags: [] },
  { id: "tall", slot: "centerpiece", name: "Tall piece", price: 60, heightIn: 72, tags: [] },
];

describe("searchCatalog", () => {
  it("enforces the strictest height rule in code", () => {
    const results = searchCatalog(CATALOG, {
      slot: "centerpiece",
      maxPrice: 200,
      hardRules: [{ type: "maxHeight", inches: 48, why: "Small room" }],
    });
    expect(results.every((item) => (item.heightIn ?? 0) <= 48)).toBe(true);
    expect(results.map((item) => item.id)).toEqual(["short"]);
  });
});
