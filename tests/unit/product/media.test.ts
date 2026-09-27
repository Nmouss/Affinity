import { describe, expect, it } from "vitest";
import { isSafeImageUrl, isTreeBundle, pickProductMedia, webModelFormat } from "@/lib/product/media";
import type { Bundle, CatalogItem } from "@/types/domain";

const base: CatalogItem = { id: "gift-1", slot: "gift", name: "Cozy Mug", price: 18, tags: ["mug"] };
const glb = { url: "https://cdn.shopify.com/models/mug.glb", format: "glb", mimeType: "model/gltf-binary", filesize: 456000 };
const usdz = { url: "https://cdn.shopify.com/models/mug.usdz", format: "usdz", mimeType: "model/vnd.usdz+zip" };

describe("pickProductMedia", () => {
  it("prefers a glb source over usdz, keeping the preview image", () => {
    const item: CatalogItem = {
      ...base,
      imageUrl: "https://cdn.shopify.com/img/mug.jpg",
      has3dModel: true,
      models3d: [{ id: "m1", previewImageUrl: "https://cdn.shopify.com/img/preview.jpg", sources: [usdz, glb] }],
    };
    expect(pickProductMedia(item)).toEqual({
      kind: "model",
      url: glb.url,
      format: "glb",
      previewImageUrl: "https://cdn.shopify.com/img/preview.jpg",
    });
  });

  it("accepts gltf by format or by MIME type", () => {
    const byFormat = { url: "https://cdn.shopify.com/m.gltf", format: "gltf", mimeType: "application/octet-stream" };
    const byMime = { url: "https://cdn.shopify.com/m.bin", format: "unknown", mimeType: "model/gltf+json" };
    expect(pickProductMedia({ ...base, models3d: [{ sources: [byFormat] }] })).toMatchObject({ kind: "model", format: "gltf" });
    expect(pickProductMedia({ ...base, models3d: [{ sources: [byMime] }] })).toMatchObject({ kind: "model", format: "gltf" });
  });

  it("rejects http models and falls back to the image", () => {
    const item: CatalogItem = {
      ...base,
      imageUrl: "https://cdn.shopify.com/img/mug.jpg",
      models3d: [{ sources: [{ ...glb, url: "http://cdn.shopify.com/models/mug.glb" }] }],
    };
    expect(pickProductMedia(item)).toEqual({ kind: "image", url: "https://cdn.shopify.com/img/mug.jpg" });
  });

  it("rejects models from hosts outside the allowlist, including look-alikes", () => {
    const evil = { ...glb, url: "https://cdn.shopify.com.evil.example/mug.glb" };
    const other = { ...glb, url: "https://models.example.com/mug.glb" };
    expect(pickProductMedia({ ...base, models3d: [{ sources: [evil, other] }] })).toEqual({ kind: "card" });
    expect(pickProductMedia({ ...base, models3d: [{ sources: [other] }] }, { allowedHosts: ["example.com"] })).toMatchObject({
      kind: "model",
    });
  });

  it("rejects oversize models but accepts ones with no reported size", () => {
    const big = { ...glb, filesize: 30 * 1024 * 1024 };
    const unsized = { url: "https://cdn.shopify.com/models/small.glb", format: "glb", mimeType: "model/gltf-binary" };
    expect(pickProductMedia({ ...base, models3d: [{ sources: [big] }] })).toEqual({ kind: "card" });
    expect(pickProductMedia({ ...base, models3d: [{ sources: [big, unsized] }] })).toMatchObject({ kind: "model", url: unsized.url });
    expect(pickProductMedia({ ...base, models3d: [{ sources: [glb] }] }, { maxBytes: 1000 })).toEqual({ kind: "card" });
  });

  it("falls to the image when there is no model, and to the card when there is no safe image", () => {
    expect(pickProductMedia({ ...base, has3dModel: false, imageUrl: "https://cdn.shopify.com/img/mug.jpg" })).toEqual({
      kind: "image",
      url: "https://cdn.shopify.com/img/mug.jpg",
    });
    expect(pickProductMedia({ ...base })).toEqual({ kind: "card" });
    expect(pickProductMedia({ ...base, imageUrl: "http://insecure.example/mug.jpg" })).toEqual({ kind: "card" });
    expect(pickProductMedia({ ...base, imageUrl: "//cdn.shopify.com/img/mug.jpg" })).toEqual({ kind: "card" });
  });

  it("accepts a same-origin relative image for the local demo catalog", () => {
    expect(pickProductMedia({ ...base, imageUrl: "/products/mug.svg" })).toEqual({ kind: "image", url: "/products/mug.svg" });
  });

  it("drops an unsafe preview image while keeping the model", () => {
    const item: CatalogItem = { ...base, models3d: [{ previewImageUrl: "http://x.example/p.jpg", sources: [glb] }] };
    expect(pickProductMedia(item)).toEqual({ kind: "model", url: glb.url, format: "glb" });
  });
});

describe("webModelFormat / isSafeImageUrl", () => {
  it("classifies formats", () => {
    expect(webModelFormat({ format: "GLB", mimeType: "" })).toBe("glb");
    expect(webModelFormat({ format: "usdz", mimeType: "model/vnd.usdz+zip" })).toBeNull();
  });
  it("classifies image urls", () => {
    expect(isSafeImageUrl(undefined)).toBe(false);
    expect(isSafeImageUrl("/a.png")).toBe(true);
    expect(isSafeImageUrl("//a/b.png")).toBe(false);
    expect(isSafeImageUrl("https://a/b.png")).toBe(true);
    expect(isSafeImageUrl("not a url")).toBe(false);
  });
});

describe("isTreeBundle", () => {
  const treeItems: CatalogItem[] = [
    { id: "tree-1", slot: "tree", name: "Fir", price: 90, tags: [] },
    { id: "lights-1", slot: "lights", name: "Warm lights", price: 20, tags: [] },
    { id: "orn-1", slot: "ornaments", name: "Gold set", price: 15, tags: [] },
    { id: "top-1", slot: "topper", name: "Star", price: 10, tags: [] },
  ];
  const bundle = (items: CatalogItem[]): Bundle => ({ items, total: 0, serves: {} });

  it("is true for the Christmas-tree demo slots", () => {
    expect(isTreeBundle(bundle(treeItems))).toBe(true);
  });
  it("is false for gift products, mixed bundles, and empty bundles", () => {
    expect(isTreeBundle(bundle([base]))).toBe(false);
    expect(isTreeBundle(bundle([...treeItems, base]))).toBe(false);
    expect(isTreeBundle(bundle([]))).toBe(false);
    expect(isTreeBundle(null)).toBe(false);
  });
});

describe("ProductPanel helpers", () => {
  it("formats money and labels sources honestly", async () => {
    const { formatMoney, sourceLabel } = await import("@/components/bundle/ProductPanel");
    expect(formatMoney(18)).toBe("$18");
    expect(formatMoney(18.99, "USD")).toBe("$18.99");
    expect(sourceLabel("local")).toBe("Demo catalog");
    expect(sourceLabel("shopify_ucp")).toBe("Shopify");
    expect(sourceLabel(undefined)).toBeNull();
  });
});
