import type { Bundle } from "@/types/domain";

export function humanMandate(bundle: Bundle) {
  return { status: "awaiting_mandate" as const, bundle };
}
