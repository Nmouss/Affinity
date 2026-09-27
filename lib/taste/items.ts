import type { TasteItem } from "./types";

// Curated cards for onboarding. Each pair below shares a category and every non-target trait, so
// a choice can be pinned on the one or two traits that differ (see comparisons.ts). Illustrations
// are original flat drawings in the Plaza palette under public/taste/.

const card = (id: string, name: string, category: string, traits: TasteItem["traits"]): TasteItem => ({
  id,
  name,
  category,
  imageUrl: `/taste/${id}.svg`,
  traits,
});

export const TASTE_ITEMS: readonly TasteItem[] = [
  // mugs: minimal vs expressive
  card("mug-plain", "Plain stoneware mug", "mug", {
    minimal: 0.9, expressive: 0.1, neutral: 0.6, colorful: 0.3, practical: 0.7, aesthetic: 0.5,
    classic: 0.6, trendy: 0.4, budgetSensitive: 0.5, premium: 0.4,
  }),
  card("mug-bold", "Big-pattern mug", "mug", {
    minimal: 0.1, expressive: 0.9, neutral: 0.6, colorful: 0.3, practical: 0.7, aesthetic: 0.5,
    classic: 0.6, trendy: 0.4, budgetSensitive: 0.5, premium: 0.4,
  }),
  // scarves: neutral vs colorful
  card("scarf-oat", "Oatmeal knit scarf", "scarf", {
    neutral: 0.9, colorful: 0.1, minimal: 0.6, expressive: 0.4, casual: 0.6, formal: 0.4,
    classic: 0.6, trendy: 0.4, budgetSensitive: 0.5, premium: 0.5,
  }),
  card("scarf-rainbow", "Striped knit scarf", "scarf", {
    neutral: 0.1, colorful: 0.9, minimal: 0.6, expressive: 0.4, casual: 0.6, formal: 0.4,
    classic: 0.6, trendy: 0.4, budgetSensitive: 0.5, premium: 0.5,
  }),
  // sneakers: classic vs trendy
  card("sneaker-court", "Low court sneaker", "sneaker", {
    classic: 0.9, trendy: 0.1, casual: 0.8, formal: 0.2, minimal: 0.5, expressive: 0.5,
    neutral: 0.6, colorful: 0.4, practical: 0.6, aesthetic: 0.5,
  }),
  card("sneaker-chunky", "Chunky-sole sneaker", "sneaker", {
    classic: 0.1, trendy: 0.9, casual: 0.8, formal: 0.2, minimal: 0.5, expressive: 0.5,
    neutral: 0.6, colorful: 0.4, practical: 0.6, aesthetic: 0.5,
  }),
  // lamps: practical vs aesthetic
  card("lamp-task", "Adjustable desk lamp", "lamp", {
    practical: 0.9, aesthetic: 0.2, minimal: 0.6, expressive: 0.4, neutral: 0.6, colorful: 0.4,
    classic: 0.5, trendy: 0.5, budgetSensitive: 0.5, premium: 0.5,
  }),
  card("lamp-sculpt", "Sculpted mood lamp", "lamp", {
    practical: 0.2, aesthetic: 0.9, minimal: 0.6, expressive: 0.4, neutral: 0.6, colorful: 0.4,
    classic: 0.5, trendy: 0.5, budgetSensitive: 0.5, premium: 0.5,
  }),
  // sweaters: casual vs formal
  card("sweater-cardigan", "Slouchy cardigan", "sweater", {
    casual: 0.9, formal: 0.1, neutral: 0.7, colorful: 0.3, minimal: 0.5, expressive: 0.5,
    classic: 0.6, trendy: 0.4, oversized: 0.5, fitted: 0.5, premium: 0.5,
  }),
  card("sweater-turtleneck", "Fine-knit turtleneck", "sweater", {
    casual: 0.15, formal: 0.85, neutral: 0.7, colorful: 0.3, minimal: 0.5, expressive: 0.5,
    classic: 0.6, trendy: 0.4, oversized: 0.5, fitted: 0.5, premium: 0.5,
  }),
  // headphones: value vs premium
  card("headphones-basic", "Everyday headphones", "headphones", {
    budgetSensitive: 0.9, premium: 0.1, minimal: 0.6, expressive: 0.4, practical: 0.7, aesthetic: 0.5,
    classic: 0.5, trendy: 0.5, neutral: 0.6, colorful: 0.4,
  }),
  card("headphones-luxe", "Studio headphones", "headphones", {
    budgetSensitive: 0.1, premium: 0.9, minimal: 0.6, expressive: 0.4, practical: 0.7, aesthetic: 0.5,
    classic: 0.5, trendy: 0.5, neutral: 0.6, colorful: 0.4,
  }),
  // hoodies: roomy vs fitted
  card("hoodie-oversized", "Oversized hoodie", "hoodie", {
    oversized: 0.9, fitted: 0.1, casual: 0.9, formal: 0.1, neutral: 0.6, colorful: 0.4,
    minimal: 0.5, expressive: 0.5, classic: 0.5, trendy: 0.5,
  }),
  card("hoodie-fitted", "Fitted hoodie", "hoodie", {
    oversized: 0.1, fitted: 0.9, casual: 0.9, formal: 0.1, neutral: 0.6, colorful: 0.4,
    minimal: 0.5, expressive: 0.5, classic: 0.5, trendy: 0.5,
  }),
  // notebooks: minimal vs expressive (refines the mug pair)
  card("notebook-plain", "Plain linen notebook", "notebook", {
    minimal: 0.85, expressive: 0.15, neutral: 0.6, colorful: 0.4, practical: 0.7, aesthetic: 0.5,
    classic: 0.6, trendy: 0.4, budgetSensitive: 0.5, premium: 0.5,
  }),
  card("notebook-doodle", "Doodle-cover notebook", "notebook", {
    minimal: 0.15, expressive: 0.85, neutral: 0.6, colorful: 0.4, practical: 0.7, aesthetic: 0.5,
    classic: 0.6, trendy: 0.4, budgetSensitive: 0.5, premium: 0.5,
  }),
  // totes: practical vs aesthetic (resolves the lamp pair)
  card("tote-canvas", "Roomy canvas tote", "tote", {
    practical: 0.9, aesthetic: 0.3, casual: 0.7, formal: 0.3, neutral: 0.6, colorful: 0.4,
    minimal: 0.6, expressive: 0.4, budgetSensitive: 0.5, premium: 0.5,
  }),
  card("tote-structured", "Structured shoulder bag", "tote", {
    practical: 0.3, aesthetic: 0.9, casual: 0.7, formal: 0.3, neutral: 0.6, colorful: 0.4,
    minimal: 0.6, expressive: 0.4, budgetSensitive: 0.5, premium: 0.5,
  }),
  // watches: neutral vs colorful (resolves the scarf pair)
  card("watch-steel", "Steel-face watch", "watch", {
    neutral: 0.9, colorful: 0.1, minimal: 0.7, expressive: 0.3, classic: 0.6, trendy: 0.4,
    premium: 0.6, budgetSensitive: 0.4, practical: 0.6, aesthetic: 0.6,
  }),
  card("watch-pop", "Bright-strap watch", "watch", {
    neutral: 0.1, colorful: 0.9, minimal: 0.7, expressive: 0.3, classic: 0.6, trendy: 0.4,
    premium: 0.6, budgetSensitive: 0.4, practical: 0.6, aesthetic: 0.6,
  }),
];

export function tasteItem(id: string): TasteItem {
  const item = TASTE_ITEMS.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown taste item: ${id}`);
  return item;
}
