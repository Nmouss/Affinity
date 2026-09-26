import type { Bundle, ComparisonPair, Product } from "../services/contracts";

// Fixed mock catalog. Mirrors the shape of Terminal 1's fixtures; values are demo data only.

const img = (id: string) => `/demo-assets/products/${id}.svg`;

function product(
  id: string,
  name: string,
  category: string,
  price: number,
  facts: Product["facts"],
  satisfies: Product["satisfies"],
  attributes: Product["attributes"] = {},
  modelUrl?: string,
): Product {
  return { id, name, category, price, imageUrl: img(id), modelUrl, attributes, facts, satisfies };
}

const safe = { no_fragile_glass: true, no_app_required: true, one_hand_operation: true };

export const products: Product[] = [
  // Quick-choice pairs: each pair differs only in the tested tradeoff.
  product("basic_lantern", "Basic Camp Lantern", "cabin_supplies", 18, { material: "plastic", runtimeHours: 12 }, safe, { durability: -0.6, affordability: 0.8 }, "/models/lantern.glb"),
  product("rugged_lantern", "Rugged Camp Lantern", "cabin_supplies", 34, { material: "aluminum", runtimeHours: 12 }, safe, { durability: 0.9, affordability: -0.2 }, "/models/lantern.glb"),
  product("compact_stove", "Compact Burner", "cabin_supplies", 45, { burners: 1, weightKg: 1.1 }, safe, { compactness: 0.9 }, "/models/stove.glb"),
  product("deluxe_stove", "Two-Burner Stove", "cabin_supplies", 45, { burners: 2, weightKg: 4.8, griddle: true }, safe, { compactness: -0.8 }, "/models/stove.glb"),
  product("manual_cooler", "Latch Cooler", "cabin_supplies", 60, { requiresApp: false, iceDays: 3 }, safe, { simpleControls: 0.9 }, "/models/cooler.glb"),
  product("smart_cooler", "App-Connected Cooler", "cabin_supplies", 60, { requiresApp: true, iceDays: 3 }, { ...safe, no_app_required: false }, { simpleControls: -0.8 }, "/models/cooler.glb"),
  product("neutral_mugs", "Stone Mug Set", "cabin_supplies", 24, { color: "gray", pieces: 4 }, safe, { expressiveStyle: -0.7 }, "/models/mug.glb"),
  product("color_mugs", "Sunset Mug Set", "cabin_supplies", 24, { color: "multicolor", pieces: 4 }, safe, { expressiveStyle: 0.8 }, "/models/mug.glb"),

  // Cart products.
  product("easy_press", "Easy Press Coffee Maker", "cooking", 32, { material: "steel", control: "one-hand plunger", containsFragileGlass: false }, safe, {}, "/models/press.glb"),
  product("cast_iron_skillet", "Cast Iron Skillet", "cooking", 60, { material: "cast iron" }, safe),
  product("glass_press", "Glass Carafe Press", "cooking", 48, { material: "borosilicate glass", containsFragileGlass: true }, { ...safe, no_fragile_glass: false }, {}, "/models/press.glb"),
  product("basic_pump", "Basic Pump Press", "cooking", 24, { material: "plastic", control: "two-hand pump" }, { ...safe, one_hand_operation: false }, {}, "/models/press.glb"),
  product("compact_press", "Compact Lever Press", "cooking", 28, { material: "steel", control: "one-hand lever" }, safe, {}, "/models/press.glb"),
  product("trail_safety_kit", "Trail Safety Kit", "safety", 48, { includes: "first aid, whistle, headlamps" }, safe),
  product("blanket_set", "Wool Blanket Set", "comfort", 104, { pieces: 4 }, safe),
  product("cabin_games", "Cabin Game Night Set", "entertainment", 71, { players: "2-8" }, safe),
  product("essentials_kit", "Shared Essentials Kit", "shared_essentials", 65, { includes: "towels, soap, trash bags" }, safe),
  product("glass_lantern", "Heirloom Glass Lantern", "safety", 58, { containsFragileGlass: true }, { ...safe, no_fragile_glass: false }),
  product("budget_blankets", "Fleece Throw Pack", "comfort", 52, { pieces: 4 }, safe),
];

export const productById = (id: string): Product | undefined => products.find((p) => p.id === id);

export const bundles: Bundle[] = [
  {
    id: "budget",
    name: "Budget Cabin Bundle",
    productIds: ["compact_press", "cast_iron_skillet", "trail_safety_kit", "budget_blankets", "cabin_games"],
    totalPrice: 259,
    attributes: { durability: 0.1, affordability: 0.9 },
    satisfies: { no_fragile_glass: true, no_app_required: true, one_hand_operation: true },
    valueScore: 90,
  },
  {
    id: "balanced",
    name: "Balanced Cabin Bundle",
    productIds: ["easy_press", "cast_iron_skillet", "trail_safety_kit", "blanket_set", "cabin_games", "essentials_kit"],
    totalPrice: 380,
    attributes: { durability: 0.7, affordability: 0.3 },
    satisfies: { no_fragile_glass: true, no_app_required: true, one_hand_operation: true },
    valueScore: 70,
  },
  {
    id: "premium",
    name: "Premium Cabin Bundle",
    productIds: ["glass_press", "cast_iron_skillet", "glass_lantern", "blanket_set", "cabin_games", "essentials_kit"],
    totalPrice: 398,
    attributes: { durability: 0.5, affordability: -0.4 },
    satisfies: { no_fragile_glass: false, no_app_required: true, one_hand_operation: true },
    valueScore: 55,
  },
];

export const comparisonPairs: ComparisonPair[] = [
  {
    pairId: "price_vs_durability",
    axis: "durability",
    leftProductId: "basic_lantern",
    rightProductId: "rugged_lantern",
    leftValue: -1,
    rightValue: 1,
    difference: "Same lantern and runtime. The right one costs $16 more and has an aluminum body.",
  },
  {
    pairId: "compact_vs_features",
    axis: "compactness",
    leftProductId: "compact_stove",
    rightProductId: "deluxe_stove",
    leftValue: 1,
    rightValue: -1,
    difference: "Same price. The left packs small with one burner; the right has two burners and a griddle.",
  },
  {
    pairId: "manual_vs_smart",
    axis: "simpleControls",
    leftProductId: "manual_cooler",
    rightProductId: "smart_cooler",
    leftValue: 1,
    rightValue: -1,
    difference: "Same cooler and ice life. The right one needs a phone app for temperature alerts.",
  },
  {
    pairId: "minimal_vs_expressive",
    axis: "expressiveStyle",
    leftProductId: "neutral_mugs",
    rightProductId: "color_mugs",
    leftValue: -1,
    rightValue: 1,
    difference: "Same mugs and price. Only the color changes: stone gray versus sunset colors.",
  },
];
