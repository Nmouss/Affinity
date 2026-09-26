import type { ShopperProfile } from "../services/contracts";

// Display vocabulary only. Nothing here scores products or decides eligibility.

export const RULE_OPTIONS: { id: string | null; label: string }[] = [
  { id: "no_fragile_glass", label: "No fragile glass" },
  { id: "no_app_required", label: "No app required" },
  { id: "under_100", label: "Stay under $100" },
  { id: "no_subscriptions", label: "No subscriptions" },
  { id: null, label: "No rule" },
];

const RULE_LABELS: Record<string, string> = {
  no_fragile_glass: "No fragile glass",
  no_app_required: "No app required",
  under_100: "Stay under $100",
  no_subscriptions: "No subscriptions",
  one_hand_operation: "One-hand operation",
  two_hand_operation: "Two-hand operation",
};

export const ruleLabel = (id: string) => RULE_LABELS[id] ?? id.replace(/_/g, " ");

/** Rule phrased as what it does, for the profile summary ("Reject fragile glass"). */
export const ruleEffect = (id: string) =>
  id === "no_fragile_glass" ? "Reject fragile glass" : id === "no_app_required" ? "Reject products that need an app" : ruleLabel(id);

/** Pole names for each taste axis: [label when preference > 0, label when < 0]. */
export const AXIS_POLES: Record<string, [string, string]> = {
  durability: ["Durability", "Lower price"],
  compactness: ["Compact", "Feature-rich"],
  simpleControls: ["Simple controls", "Smart features"],
  expressiveStyle: ["Colorful style", "Minimal style"],
};

export const AXIS_SUMMARY: Record<string, [string, string, string]> = {
  // [positive summary, negative summary, unknown summary]
  durability: ["Durable over the lowest price", "Lowest price over durability", "Price versus durability"],
  compactness: ["Compact over extra features", "Extra features over compact", "Compact versus feature-rich"],
  simpleControls: ["Simple controls", "Smart, app-connected features", "Simple versus smart controls"],
  expressiveStyle: ["Colorful, expressive style", "Neutral, minimal style", "Color and visual style"],
};

export const poleLabel = (axis: string, direction: number) =>
  (AXIS_POLES[axis] ?? [axis, axis])[direction >= 0 ? 0 : 1];

export type SignalStrength = "strong" | "weak" | "unknown";

/**
 * Presentation bucket for one axis, read straight from the engine's evidence counts: no evidence is
 * "Still unknown", two or more agreeing choices (or a stated reason, which the engine weights more)
 * is "Strong", a single choice is "Weak". It never computes a preference itself.
 * TODO(Terminal 1): use a per-axis signal strength if the profile response adds one.
 */
export function signalStrength(profile: ShopperProfile, axis: string): SignalStrength {
  const evidence = profile.evidenceCounts[axis] ?? 0;
  const preference = profile.preferences[axis] ?? 0;
  if (evidence === 0 || preference === 0) return "unknown";
  return evidence >= 2 || Math.abs(preference) >= 2 ? "strong" : "weak";
}

export const CATEGORY_LABELS: Record<string, string> = {
  cooking: "Cooking",
  safety: "Safety",
  comfort: "Comfort",
  entertainment: "Entertainment",
  shared_essentials: "Shared essentials",
};

export const categoryLabel = (id: string) => CATEGORY_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

export const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

export function nameFor(shopperId: string, shoppers: ShopperProfile[]): string {
  return shoppers.find((s) => s.id === shopperId)?.name ?? (shopperId === "judge" ? "You" : shopperId.charAt(0).toUpperCase() + shopperId.slice(1));
}
