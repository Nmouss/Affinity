import type { TargetId } from "@/types/stage";
import { HAND_ITEM_ATTR, HAND_TARGET_ATTR, uiTargetId } from "./makerHitTest";

// Pure target resolution for MakerHands' hitTest, kept DOM-free so it's unit-testable in vitest's
// node environment. MakerHands.tsx walks the real element chain (itself, then each
// `parentElement`) and hands it here.

/** The bit of `Element` this needs; real DOM elements satisfy it structurally, no cast required. */
export interface AttrElement {
  getAttribute(name: string): string | null;
}

/**
 * Resolves the TargetId for a chain of elements walked outward from the pointer's hit element
 * (itself, then each ancestor in turn — see `elementChain` in MakerHands.tsx). The nearest element
 * carrying `data-hand-target` wins as a `ui:` target; failing that, the nearest one carrying
 * `data-hand-item` wins as an `item:` target — so a card's `data-hand-item` never beats a closer
 * `data-hand-target` button, but does win over one further up the tree. Mirrors
 * `element.closest("[data-hand-target], [data-hand-item]")`, expressed as data so it needs no DOM.
 */
export function resolveHandTarget(chain: Iterable<AttrElement>): TargetId | null {
  for (const element of chain) {
    const targetValue = element.getAttribute(HAND_TARGET_ATTR);
    if (targetValue !== null) return uiTargetId(targetValue);
    const itemId = element.getAttribute(HAND_ITEM_ATTR);
    if (itemId !== null) return `item:${itemId}`;
  }
  return null;
}
