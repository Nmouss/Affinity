import type { TasteSummaryForAgents } from "@/types/domain";
import { summarize } from "./summary";
import { TASTE_TRAITS } from "./traits";
import type { TasteProfile, TasteTrait } from "./types";

// The one conversion from a learned TasteProfile to what the Python backend reasons from. Canonical
// trait names travel (the backend owns their consumer wording); scores below LIKE/above DISLIKE with
// enough confidence become positive preferences and dislikes. Never a hard rule: taste can't veto.

/** A trait counts as a like above this score, a dislike below its mirror, given enough confidence. */
export const LIKE_SCORE = 0.6;
export const DISLIKE_SCORE = 0.4;
export const MIN_CONFIDENCE = 0.3;

export function toAgentTaste(profile: TasteProfile): TasteSummaryForAgents {
  const traits: TasteSummaryForAgents["traits"] = {};
  const likes: Array<[TasteTrait, number]> = [];
  const dislikes: Array<[TasteTrait, number]> = [];
  let evidenceCount = 0;
  let confidenceSum = 0;
  let confident = 0;
  for (const trait of TASTE_TRAITS) {
    const preference = profile.traits[trait];
    if (!preference || preference.evidence.length === 0) continue;
    traits[trait] = { score: round(preference.score), confidence: round(preference.confidence) };
    evidenceCount += preference.evidence.length;
    confidenceSum += preference.confidence;
    confident += 1;
    if (preference.confidence < MIN_CONFIDENCE) continue;
    if (preference.score >= LIKE_SCORE) likes.push([trait, preference.score]);
    else if (preference.score <= DISLIKE_SCORE) dislikes.push([trait, preference.score]);
  }
  likes.sort((a, b) => b[1] - a[1]);
  dislikes.sort((a, b) => a[1] - b[1]);
  return {
    summary: profile.summary ?? summarize(profile),
    likes: likes.map(([trait]) => trait),
    dislikes: dislikes.map(([trait]) => trait),
    confidence: confident === 0 ? 0 : round(confidenceSum / confident),
    traits,
    evidenceCount,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
