import catalog from "@/data/catalog.json";
import { searchCatalog } from "@/lib/catalog/search";
import type { Bundle, CatalogItem, ConstraintSet, Mission } from "@/types/domain";

export function shop(mission: Mission, constraints: ConstraintSet): Bundle {
  const slots = ["tree", "lights", "ornaments", "topper"] as const;
  const items = slots.flatMap((slot) => searchCatalog(catalog as CatalogItem[], {
    slot,
    maxPrice: mission.budget,
    hardRules: constraints.hardRules,
  }).slice(0, 1));
  return { items, total: items.reduce((sum, item) => sum + item.price, 0), serves: {} };
}
