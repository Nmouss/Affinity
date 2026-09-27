import type { Bundle, CatalogItem, ProductModel3dSource } from "@/types/domain";

// Pure media selection for the product pedestal. No three.js or React, so it is unit-tested.
// The backend passes through merchant-supplied Shopify model assets; the frontend only ever
// loads a web-renderable glTF/GLB from an allowlisted https host, and otherwise falls back to
// the product image, then to a named card. A missing or broken model must never block approval.

export type ProductMedia =
  | { kind: "model"; url: string; format: "glb" | "gltf"; previewImageUrl?: string }
  | { kind: "image"; url: string }
  | { kind: "card" };

export interface PickMediaOptions {
  /** Hosts (exact or subdomain) a 3D model may be fetched from. */
  allowedHosts?: readonly string[];
  /** Largest model file we will try to load when the source reports a size. */
  maxBytes?: number;
}

export const DEFAULT_MODEL_HOSTS: readonly string[] = ["cdn.shopify.com"];
export const DEFAULT_MAX_MODEL_BYTES = 25 * 1024 * 1024;

/** The local Christmas-tree slots the TreeAssembly renderer knows how to build. */
export const TREE_SLOTS: ReadonlySet<string> = new Set(["tree", "lights", "ornaments", "topper", "decoy"]);

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const lower = host.toLowerCase();
  return allowed.some((entry) => {
    const candidate = entry.toLowerCase();
    return lower === candidate || lower.endsWith(`.${candidate}`);
  });
}

/** glb/gltf by declared format first, then by MIME type; anything else (usdz, obj…) is skipped. */
export function webModelFormat(source: Pick<ProductModel3dSource, "format" | "mimeType">): "glb" | "gltf" | null {
  const format = source.format?.toLowerCase();
  if (format === "glb") return "glb";
  if (format === "gltf") return "gltf";
  const mime = source.mimeType?.toLowerCase();
  if (mime === "model/gltf-binary") return "glb";
  if (mime === "model/gltf+json") return "gltf";
  return null;
}

/** True for an https URL or a same-origin path ("/products/x.svg"), never protocol-relative "//". */
export function isSafeImageUrl(value: string | undefined): value is string {
  if (!value) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  return parseHttpsUrl(value) !== null;
}

/**
 * The media the pedestal should show for `item`: the first web-renderable model from an allowed
 * host under the size cap, else the product image, else a named card.
 */
export function pickProductMedia(item: CatalogItem, options: PickMediaOptions = {}): ProductMedia {
  const allowedHosts = options.allowedHosts ?? DEFAULT_MODEL_HOSTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_MODEL_BYTES;

  for (const model of item.models3d ?? []) {
    for (const source of model.sources ?? []) {
      const format = webModelFormat(source);
      if (!format) continue;
      const url = parseHttpsUrl(source.url);
      if (!url || !hostAllowed(url.hostname, allowedHosts)) continue;
      if (typeof source.filesize === "number" && source.filesize > maxBytes) continue;
      return {
        kind: "model",
        url: url.toString(),
        format,
        ...(isSafeImageUrl(model.previewImageUrl) ? { previewImageUrl: model.previewImageUrl } : {}),
      };
    }
  }

  if (isSafeImageUrl(item.imageUrl)) return { kind: "image", url: item.imageUrl };
  return { kind: "card" };
}

/** True when every item is a local tree slot, so the Christmas-tree assembly renders the bundle. */
export function isTreeBundle(bundle: Pick<Bundle, "items"> | null | undefined): boolean {
  if (!bundle || bundle.items.length === 0) return false;
  return bundle.items.every((item) => TREE_SLOTS.has(item.slot));
}
