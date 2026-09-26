import type { CatalogSlot, HouseRule } from "@/types/domain";

export interface CatalogSearch {
  slot: CatalogSlot;
  maxPrice: number;
  tags?: string[];
  hardRules: HouseRule[];
}
