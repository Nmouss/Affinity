import type { Bundle, SpriteScore } from "@/types/domain";

// Pure derivation of who backs one proposed item, for the review card's supporter circles.
// Product heuristic, not science: a character "serves" an item when the backend attributed it to
// them, and their council score (0–10) tells how warm they are on the whole proposal.

export type SupportLevel = "strong" | "neutral" | "cool" | "unknown";

export interface Supporter {
  id: string;
  level: SupportLevel;
  /** True when the backend picked this item for this person specifically. */
  serves: boolean;
  score: number | null;
  /** The character's own words about the proposal, when they've scored it. */
  say: string | null;
}

export const STRONG_SCORE = 7;
export const COOL_SCORE = 6;

const LEVEL_RANK: Record<SupportLevel, number> = { strong: 0, neutral: 1, unknown: 2, cool: 3 };

export function supportLevel(serves: boolean, score: number | null): SupportLevel {
  if (serves) return "strong";
  if (score === null) return "unknown";
  if (score >= STRONG_SCORE) return "strong";
  if (score < COOL_SCORE) return "cool";
  return "neutral";
}

/** Supporters for `itemId`, strongest first, keeping the given participant order within a level. */
export function supportersFor(
  itemId: string,
  participantIds: readonly string[],
  serves: Bundle["serves"],
  scores: Record<string, SpriteScore>,
): Supporter[] {
  return participantIds
    .map((id, index) => {
      const servesItem = (serves[id] ?? []).includes(itemId);
      const score = scores[id]?.score ?? null;
      return { id, index, serves: servesItem, score, say: scores[id]?.say ?? null, level: supportLevel(servesItem, score) };
    })
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.index - b.index)
    .map(({ index: _index, ...supporter }) => supporter);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** One plain sentence about the room's mood on this item. Names come from the caller (roster). */
export function supportSentence(supporters: readonly Supporter[], nameOf: (id: string) => string): string {
  const strong = supporters.filter((s) => s.level === "strong").map((s) => nameOf(s.id));
  const cool = supporters.filter((s) => s.level === "cool").map((s) => nameOf(s.id));
  const scored = supporters.some((s) => s.score !== null || s.serves);
  if (!scored) return "The council is still weighing in.";
  const parts: string[] = [];
  if (strong.length > 0) parts.push(`${joinNames(strong)} ${strong.length === 1 ? "is" : "are"} behind this pick`);
  if (cool.length > 0) parts.push(`${joinNames(cool)} ${cool.length === 1 ? "isn't" : "aren't"} sold yet`);
  if (parts.length === 0) return "Everyone is warm on it, nobody is set on it.";
  return `${parts.join("; ")}.`;
}
