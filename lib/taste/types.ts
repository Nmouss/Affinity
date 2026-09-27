// Structured, interpretable taste: what a character has learned about what a person likes. Cards
// shown during onboarding are observations; the normalized traits below are the data. Persisted
// per person beside the roster (lib/people/roster.ts) and mapped to agent-facing preferences.

export type TasteTrait =
  | "minimal"
  | "expressive"
  | "casual"
  | "formal"
  | "neutral"
  | "colorful"
  | "classic"
  | "trendy"
  | "practical"
  | "aesthetic"
  | "budgetSensitive"
  | "premium"
  | "oversized"
  | "fitted";

/** One recorded comparison outcome for one trait. `delta` is the signed score change it applied. */
export interface TasteEvidence {
  comparisonId: string;
  selectedItemId: string;
  rejectedItemId: string;
  delta: number;
  recordedAt: string;
}

export interface TraitPreference {
  /** 0..1 how much the person leans toward this trait; 0.5 is "no lean yet". */
  score: number;
  /** 0..1 how sure we are, grown only by comparisons with meaningful separation. */
  confidence: number;
  evidence: TasteEvidence[];
}

export interface TasteProfile {
  version: 1;
  traits: Partial<Record<TasteTrait, TraitPreference>>;
  completedComparisonIds: string[];
  summary?: string;
  updatedAt: string;
}

export interface TasteItem {
  id: string;
  name: string;
  category: string;
  imageUrl?: string;
  traits: Partial<Record<TasteTrait, number>>;
}

export type TasteStage = "broad" | "refine" | "resolve";

export interface TasteComparison {
  id: string;
  stage: TasteStage;
  targetTraits: TasteTrait[];
  left: TasteItem;
  right: TasteItem;
}

/** What the person did with a pair: picked a side, wanted neither, or passed. */
export type TasteChoice = "left" | "right" | "neither" | "skip";
