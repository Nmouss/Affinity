import type { Mission } from "@/types/domain";

export const DEFAULT_BUDGET = 200;

const OCCASIONS = ["christmas", "hanukkah", "birthday", "anniversary", "thanksgiving", "halloween", "easter"];

export function parseBudget(text: string): number {
  const dollars = text.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/);
  const bare = text.match(/\b(?:under|below|max(?:imum)?|budget(?: of)?)\s+(\d[\d,]*(?:\.\d+)?)/i);
  const raw = dollars?.[1] ?? bare?.[1];
  const budget = raw ? Number(raw.replace(/,/g, "")) : Number.NaN;
  return Number.isFinite(budget) && budget > 0 ? budget : DEFAULT_BUDGET;
}

export function parseOccasion(text: string): string {
  const lower = text.toLowerCase();
  const known = OCCASIONS.find((occasion) => lower.includes(occasion));
  if (known) return known.charAt(0).toUpperCase() + known.slice(1);
  const stripped = text.replace(/,?\s*(?:under|below|for)?\s*\$\s*\d[\d,]*(?:\.\d+)?/gi, "").trim();
  return stripped || "Family purchase";
}

/** Mission text plus the seated sprites (in seat order) become the intent the council works on. */
export function buildMission(text: string, invitedSpriteIds: string[]): Mission {
  return {
    occasion: parseOccasion(text),
    budget: parseBudget(text),
    freeText: text.trim(),
    type: "shared",
    invitedSpriteIds,
  };
}
