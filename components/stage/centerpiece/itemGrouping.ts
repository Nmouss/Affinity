import type { CatalogItem } from "@/types/domain";

/** Groups bundle items by slot, preserving each slot's first-seen order across the item list. */
export function groupBySlot(items: readonly CatalogItem[]): Map<string, CatalogItem[]> {
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const group = groups.get(item.slot);
    if (group) group.push(item);
    else groups.set(item.slot, [item]);
  }
  return groups;
}

/** Slot order for the pedestal row: first-seen order in the bundle, stable across revisions. */
export function slotOrder(items: readonly CatalogItem[]): string[] {
  const order: string[] = [];
  for (const item of items) if (!order.includes(item.slot)) order.push(item.slot);
  return order;
}

const PEDESTAL_SPACING = 1.8;

/** One [x, z] offset per pedestal, spread in a row centered on the centerpiece corner. */
export function pedestalLayout(slotCount: number): Array<[number, number]> {
  if (slotCount === 0) return [];
  const span = (slotCount - 1) * PEDESTAL_SPACING;
  return Array.from({ length: slotCount }, (_, index) => [index * PEDESTAL_SPACING - span / 2, 0]);
}
