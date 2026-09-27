import { tasteItem } from "./items";
import type { TasteComparison, TasteStage, TasteTrait } from "./types";

// Ten pairs as an information-gathering sequence: broad contrasts first, narrower refinement in the
// middle, then two pairs that revisit high-priority traits so a lingering low-confidence axis gets
// resolved. Order here is also the deterministic fallback when nothing adaptive remains.

const pair = (id: string, stage: TasteStage, targetTraits: TasteTrait[], left: string, right: string): TasteComparison => ({
  id,
  stage,
  targetTraits,
  left: tasteItem(left),
  right: tasteItem(right),
});

export const TASTE_COMPARISONS: readonly TasteComparison[] = [
  pair("c-mug", "broad", ["minimal", "expressive"], "mug-plain", "mug-bold"),
  pair("c-scarf", "broad", ["neutral", "colorful"], "scarf-oat", "scarf-rainbow"),
  pair("c-sneaker", "broad", ["classic", "trendy"], "sneaker-court", "sneaker-chunky"),
  pair("c-lamp", "broad", ["practical", "aesthetic"], "lamp-task", "lamp-sculpt"),
  pair("c-sweater", "refine", ["casual", "formal"], "sweater-cardigan", "sweater-turtleneck"),
  pair("c-headphones", "refine", ["budgetSensitive", "premium"], "headphones-basic", "headphones-luxe"),
  pair("c-hoodie", "refine", ["oversized", "fitted"], "hoodie-oversized", "hoodie-fitted"),
  pair("c-notebook", "refine", ["minimal", "expressive"], "notebook-plain", "notebook-doodle"),
  pair("c-tote", "resolve", ["practical", "aesthetic"], "tote-canvas", "tote-structured"),
  pair("c-watch", "resolve", ["neutral", "colorful"], "watch-steel", "watch-pop"),
];
