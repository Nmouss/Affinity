import { describe, expect, it, vi } from "vitest";
import { openCheckout, selectCheckoutUrl } from "@/components/hud/Receipt";
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

describe("openCheckout", () => {
  const url = "https://example-merchant.myshopify.com/checkout/abc";

  it("opens a new tab and severs its opener when the popup is allowed", () => {
    const tab = { opener: {} as unknown };
    const win = { open: vi.fn(() => tab as unknown as Window), location: { assign: vi.fn() } as unknown as Location };
    openCheckout(url, win);
    expect(win.open).toHaveBeenCalledWith(url, "_blank");
    expect(tab.opener).toBeNull();
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it("falls back to this tab when the popup is blocked (a Leap pinch has no user activation)", () => {
    const win = { open: vi.fn(() => null), location: { assign: vi.fn() } as unknown as Location };
    openCheckout(url, win);
    expect(win.location.assign).toHaveBeenCalledWith(url);
  });
});
