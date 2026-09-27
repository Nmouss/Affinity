import { describe, expect, it } from "vitest";
import { resolveHandTarget, type AttrElement } from "@/components/hands/makerTargets";
import { HAND_ITEM_ATTR, HAND_TARGET_ATTR } from "@/components/hands/makerHitTest";

// Fakes an ancestor chain the way MakerHands' elementChain would walk it (itself, then each
// parentElement in turn) without needing a real DOM.
function element(attrs: Record<string, string>): AttrElement {
  return { getAttribute: (name: string) => attrs[name] ?? null };
}

describe("resolveHandTarget", () => {
  it("returns null for an empty chain (nothing under the pointer)", () => {
    expect(resolveHandTarget([])).toBeNull();
  });

  it("returns null when nothing in the chain carries either attribute", () => {
    expect(resolveHandTarget([element({}), element({ id: "whatever" })])).toBeNull();
  });

  it("wraps a data-hand-target on the hit element into a ui: target", () => {
    expect(resolveHandTarget([element({ [HAND_TARGET_ATTR]: "cart-approve" })])).toBe("ui:cart-approve");
  });

  it("wraps a data-hand-item on the hit element into an item: target", () => {
    expect(resolveHandTarget([element({ [HAND_ITEM_ATTR]: "orn-dino" })])).toBe("item:orn-dino");
  });

  it("finds a data-hand-target on an ancestor when the hit element has neither attribute", () => {
    const chain = [element({}), element({}), element({ [HAND_TARGET_ATTR]: "editor-save" })];
    expect(resolveHandTarget(chain)).toBe("ui:editor-save");
  });

  it("a closer data-hand-item wins over a farther data-hand-target", () => {
    const chain = [
      element({ [HAND_ITEM_ATTR]: "inflatable-trex" }),
      element({ [HAND_TARGET_ATTR]: "plaza-panel" }),
    ];
    expect(resolveHandTarget(chain)).toBe("item:inflatable-trex");
  });

  it("a closer data-hand-target wins over a farther data-hand-item", () => {
    const chain = [
      element({ [HAND_TARGET_ATTR]: "cart-approve" }),
      element({ [HAND_ITEM_ATTR]: "orn-dino" }),
    ];
    expect(resolveHandTarget(chain)).toBe("ui:cart-approve");
  });

  it("prefers data-hand-target over data-hand-item on the very same element", () => {
    const chain = [element({ [HAND_TARGET_ATTR]: "cart-approve", [HAND_ITEM_ATTR]: "orn-dino" })];
    expect(resolveHandTarget(chain)).toBe("ui:cart-approve");
  });

  it("stops at the first matching ancestor, ignoring anything further up", () => {
    const chain = [
      element({}),
      element({ [HAND_ITEM_ATTR]: "orn-dino" }),
      element({ [HAND_TARGET_ATTR]: "should-not-win" }),
    ];
    expect(resolveHandTarget(chain)).toBe("item:orn-dino");
  });
});
