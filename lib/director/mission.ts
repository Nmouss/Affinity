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
    kind: "shopping",
    invitedSpriteIds,
  };
}

export interface GiftMissionInput {
  /** The person the gift is for; always invited and always first, so the ring seats them by the hearth. */
  recipientId: string;
  /** Family and friends who weigh in. Duplicates of the recipient are dropped. */
  advisorIds: string[];
  budget: number;
  /** Defaults to Christmas: this slice is the holiday gift demo. */
  occasion?: string;
  /** What the shopper should look for; becomes the single shopping slot's query. */
  slotQuery: string;
  freeText?: string;
}

export const GIFT_SLOT_ID = "gift";

/** A gift mission: one recipient whose wishes weigh double, optional advisors, one explicit shopping slot. */
export function buildGiftMission(input: GiftMissionInput): Mission {
  const advisors = input.advisorIds.filter((id, index, all) => id !== input.recipientId && all.indexOf(id) === index);
  const query = input.slotQuery.trim();
  const occasion = input.occasion?.trim() || "Christmas";
  const budget = Number.isFinite(input.budget) && input.budget > 0 ? input.budget : DEFAULT_BUDGET;
  return {
    occasion,
    budget,
    freeText: input.freeText?.trim() || (/\bgift\b/i.test(query) ? query : `${occasion} gift: ${query}`),
    type: "gift",
    kind: "shopping",
    recipientId: input.recipientId,
    invitedSpriteIds: [input.recipientId, ...advisors],
    shoppingSlots: [{ id: GIFT_SLOT_ID, query, quantity: 1 }],
  };
}
