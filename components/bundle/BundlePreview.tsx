import type { Bundle } from "@/types/domain";

export function BundlePreview({ bundle }: { bundle: Bundle }) {
  return <section><h2>Proposed bundle</h2><p>${bundle.total.toFixed(2)}</p></section>;
}
