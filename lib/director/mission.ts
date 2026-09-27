import { getPerson } from "@/lib/people/roster";
import type { Mission, ShoppingSlot } from "@/types/domain";

export const DEFAULT_BUDGET = 200;

/** Local catalog slots used one-per-recipient so a multi-person shop is multiple products. */
export const GIFT_CATALOG_SLOTS = ["centerpiece", "extra", "wrapping", "card"] as const;

export const MAX_SHOP_RECIPIENTS = GIFT_CATALOG_SLOTS.length;

const OCCASIONS = ["christmas", "hanukkah", "birthday", "anniversary", "thanksgiving", "halloween", "easter"];
const PLAN_WORDS = /\b(dinner|restaurant|reservation|activity|activities|outing|date night|things to do|itinerary|plan a)\b/i;

export function isPlanPrompt(text: string): boolean {
  return PLAN_WORDS.test(text);
}

export function parsePlanLocation(text: string): string {
  const match = text.match(/\b(?:in|near|around)\s+([^,.;]+?)(?=\s+(?:under|below|at|on|for)\b|$)/i);
  return match?.[1]?.trim() || process.env.NEXT_PUBLIC_DEFAULT_PLAN_LOCATION || "Atlanta, GA";
}

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
export function buildMission(
  text: string,
  invitedSpriteIds: string[],
  options?: { recipientIds?: string[] },
): Mission {
  const freeText = text.trim();
  if (isPlanPrompt(freeText)) {
    const wantsDinner = /\b(dinner|restaurant|reservation|date night|food)\b/i.test(freeText);
    const wantsActivity = /\b(activity|activities|outing|things to do|date night|after dinner)\b/i.test(freeText);
    const planSlots = [
      ...(wantsDinner
        ? [{ id: "dinner", query: freeText, includedType: "restaurant", minRating: 4, durationMinutes: 90 }]
        : []),
      ...(wantsActivity || !wantsDinner
        ? [{ id: "activity", query: freeText, minRating: 4, durationMinutes: 90 }]
        : []),
    ];
    return {
      kind: "plan",
      occasion: parseOccasion(freeText),
      budget: parseBudget(freeText),
      freeText,
      type: "shared",
      invitedSpriteIds,
      location: { label: parsePlanLocation(freeText) },
      planSlots,
    };
  }
  const recipientIds = [...new Set(options?.recipientIds ?? [])]
    .filter((id) => invitedSpriteIds.includes(id))
    .slice(0, MAX_SHOP_RECIPIENTS);
  const shoppingSlots: ShoppingSlot[] | undefined =
    recipientIds.length === 0
      ? undefined
      : recipientIds.map((id, index) => {
          const person = getPerson(id);
          const name = person?.name ?? id;
          const loves = person?.loves?.slice(0, 3).join(", ");
          return {
            id: GIFT_CATALOG_SLOTS[index]!,
            query: loves ? `gift for ${name}: ${loves}` : `thoughtful gift for ${name}`,
            quantity: 1,
          };
        });
  return {
    occasion: parseOccasion(text),
    budget: parseBudget(text),
    freeText,
    type: recipientIds.length === 1 ? "gift" : "shared",
    invitedSpriteIds,
    kind: "shopping",
    ...(recipientIds[0] ? { recipientId: recipientIds[0] } : {}),
    ...(recipientIds.length ? { recipientIds, shoppingSlots } : {}),
  };
}
