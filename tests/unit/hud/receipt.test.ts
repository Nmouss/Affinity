import { describe, expect, it } from "vitest";
import { selectCheckoutUrl } from "@/components/hud/Receipt";
import type { CommerceCart } from "@/types/domain";

const cart = (overrides: Partial<CommerceCart> = {}): CommerceCart => ({
  merchantDomain: "example-merchant.myshopify.com",
  cartId: "cart_1",
  checkoutUrl: "https://example-merchant.myshopify.com/checkout/abc",
  ...overrides,
});

describe("selectCheckoutUrl", () => {
  it("returns null when no carts have been created yet", () => {
    expect(selectCheckoutUrl([])).toBeNull();
  });

  it("returns the first cart's checkout URL", () => {
    expect(selectCheckoutUrl([cart()])).toBe("https://example-merchant.myshopify.com/checkout/abc");
  });

  it("ignores any additional carts, matching the single 'Open Shopify checkout' button", () => {
    const first = cart({ cartId: "cart_1", checkoutUrl: "https://a.example/checkout" });
    const second = cart({ cartId: "cart_2", checkoutUrl: "https://b.example/checkout" });
    expect(selectCheckoutUrl([first, second])).toBe("https://a.example/checkout");
  });
});
