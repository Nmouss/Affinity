import type { Bundle } from "@/types/domain";

/** Which sprite an item serves, from bundle.serves. Null when no sprite claims it. */
export function servingSprite(serves: Bundle["serves"], itemId: string): string | null {
  for (const [spriteId, itemIds] of Object.entries(serves)) {
    if (itemIds.includes(itemId)) return spriteId;
  }
  return null;
}
