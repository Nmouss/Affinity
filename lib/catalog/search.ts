import type { CatalogItem } from "@/types/domain";
import type { CatalogSearch } from "./types";

export function searchCatalog(catalog: CatalogItem[], query: CatalogSearch): CatalogItem[] {
  const maxHeight = Math.min(...query.hardRules
    .filter((rule) => rule.type === "maxHeight" && rule.inches !== undefined)
    .map((rule) => rule.inches as number), Infinity);
  const excludedTags = new Set(query.hardRules
    .filter((rule) => rule.type === "excludedTag" && rule.tag)
    .map((rule) => rule.tag as string));

  return catalog.filter((item) =>
    item.slot === query.slot
    && item.price <= query.maxPrice
    && (item.heightIn === undefined || item.heightIn <= maxHeight)
    && !item.tags.some((tag) => excludedTags.has(tag))
    && (!query.tags?.length || query.tags.some((tag) => item.tags.includes(tag)))
  );
}
