import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// The vitest JSX transform here is classic, so this file's own JSX (below) needs React in scope too.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CartReview } from "@/components/hud/CartReview";
import type { Bundle, CatalogItem } from "@/types/domain";

const item = (id: string, name: string): CatalogItem => ({
  id,
  slot: "gift",
  name,
  price: 19.99,
  tags: [],
});

function bundleOf(items: CatalogItem[]): Bundle {
  return { items, total: items.reduce((sum, entry) => sum + entry.price, 0), serves: {} };
}

const noop = () => {};

/** Every <button ...> tag in a chunk of rendered HTML, so tests can assert an attribute on all of them. */
function buttonTags(html: string): string[] {
  return html.match(/<button\b[^>]*>/g) ?? [];
}

describe("CartReview (static render)", () => {
  it("gives every button a unique data-hand-target, in the normal per-item review state", () => {
    const bundle = bundleOf([item("a", "Wooden Blocks"), item("b", "Puzzle")]);
    const html = renderToStaticMarkup(
      <CartReview bundle={bundle} swapping={null} onSwap={noop} onCancel={noop} onApproveCart={noop} />,
    );
    const buttons = buttonTags(html);
    expect(buttons.length).toBeGreaterThan(0);
    for (const tag of buttons) {
      expect(tag).toMatch(/data-hand-target="[^"]+"/);
    }
    // Unique per button: no two rendered buttons share the same target id.
    const targets = buttons.map((tag) => tag.match(/data-hand-target="([^"]+)"/)?.[1]);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("tags the empty-cart cancel button when there is nothing left to review", () => {
    const html = renderToStaticMarkup(
      <CartReview bundle={bundleOf([])} swapping={null} onSwap={noop} onCancel={noop} onApproveCart={noop} />,
    );
    const buttons = buttonTags(html);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('data-hand-target="cart-empty"');
  });

  it("does not wire the final cart approval to a plain click; it goes through MandateButton's handshake", () => {
    // The whole-item-review flow can't reach the "every item approved" state from a single render
    // (approvedIds is internal state, populated only by clicking through items), so this checks the
    // wiring in CartReview.tsx directly: the final approval must go through MandateButton's
    // onApprove, never a raw onClick={onApproveCart} button like the old "Approve cart & continue to
    // checkout" click did.
    const source = readFileSync(fileURLToPath(new URL("../../../components/hud/CartReview.tsx", import.meta.url)), "utf8");
    expect(source).toMatch(/import\s*\{\s*MandateButton\s*\}\s*from\s*"@\/components\/controls\/MandateButton"/);
    expect(source).toMatch(/<MandateButton[^>]*onApprove=\{onApproveCart\}/);
    expect(source).not.toMatch(/onClick=\{onApproveCart\}/);
    expect(source).not.toMatch(/onClick=\{\(\)\s*=>\s*onApproveCart/);
    expect(source).not.toContain("Approve cart &amp; continue to checkout");
  });
});
