import { describe, expect, it } from "vitest";
import catalog from "@/data/catalog.json";
import { searchCatalog } from "@/lib/catalog/search";
import type { CatalogItem } from "@/types/domain";

describe("searchCatalog", () => {
  it("enforces the strictest height rule in code", () => {
    const trees = searchCatalog(catalog as CatalogItem[], {
      slot: "tree",
      maxPrice: 200,
      hardRules: [{ type: "maxHeight", inches: 48, why: "Small room" }],
    });
    expect(trees.every((tree) => (tree.heightIn ?? 0) <= 48)).toBe(true);
  });
});
