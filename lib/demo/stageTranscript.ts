import type { Bundle, CouncilEvent } from "@/types/domain";

// The replay transport for the stage: data/cached-transcript.json plus the merge result, one score per
// sprite, and the mandate interrupt, each with the latency a live council roughly shows.

export interface TimedCouncilEvent {
  /** Delay after the previous event, as a live stream would produce it. */
  afterMs: number;
  event: CouncilEvent;
}

const BUNDLE: Bundle = {
  items: [
    { id: "gift-lamp", slot: "centerpiece", name: "Sculptural desk lamp", price: 74, heightIn: 20, tags: ["design-forward pieces"] },
    { id: "wrap-simple", slot: "wrapping", name: "Kraft paper and twine", price: 6, tags: ["neutral tones"] },
    { id: "card-simple", slot: "card", name: "Letterpress card", price: 5, tags: ["local makers"] },
    { id: "extra-mug", slot: "extra", name: "Hand-thrown mug", price: 18, tags: ["local makers", "quality over quantity"] },
  ],
  total: 103,
  serves: { wife: ["gift-lamp", "wrap-simple"], daughter: ["card-simple", "extra-mug"], son: ["gift-lamp"] },
};

export const STAGE_TIMELINE = [
  {
    afterMs: 1400,
    event: {
      type: "opinion",
      payload: {
        spriteId: "wife",
        say: "Something practical and well-made, please—and let's keep it under $25.",
        hardRules: [{ type: "maxHeight", inches: 24, why: "It has to fit on the shared shelf." }],
        wishes: ["neutral tones", "useful gifts"],
        vetoes: ["novelty items"],
      },
    },
  },
  {
    afterMs: 350,
    event: {
      type: "opinion",
      payload: {
        spriteId: "daughter",
        say: "Can we find something from a local maker instead of the usual mall stuff?",
        hardRules: [],
        wishes: ["local makers", "design-forward pieces"],
        vetoes: [],
      },
    },
  },
  {
    afterMs: 500,
    event: {
      type: "opinion",
      payload: {
        spriteId: "son",
        say: "I say we go big—get the giant arc lamp, make it a whole thing.",
        hardRules: [],
        wishes: ["oversized", "conversation pieces"],
        vetoes: [],
      },
    },
  },
  {
    afterMs: 120,
    event: {
      type: "constraints",
      payload: {
        hardRules: [{ type: "maxHeight", inches: 24, why: "It has to fit on the shared shelf." }],
        wishes: [
          { spriteId: "wife", wish: "neutral tones", weight: 1 },
          { spriteId: "wife", wish: "useful gifts", weight: 1 },
          { spriteId: "daughter", wish: "local makers", weight: 1 },
          { spriteId: "daughter", wish: "design-forward pieces", weight: 1 },
          { spriteId: "son", wish: "oversized", weight: 1 },
          { spriteId: "son", wish: "conversation pieces", weight: 1 },
        ],
        conflicts: [
          { rule: "Maximum height: 24 inches", wish: "oversized floor arc lamp", resolution: "Use a sculptural desk lamp instead." },
        ],
      },
    },
  },
  {
    afterMs: 40,
    event: {
      type: "veto",
      payload: { rule: "Maximum height: 24 inches", wish: "oversized floor arc lamp", resolution: "Use a sculptural desk lamp instead." },
    },
  },
  { afterMs: 2600, event: { type: "bundle", payload: BUNDLE } },
  {
    afterMs: 900,
    event: { type: "score", payload: { spriteId: "wife", score: 9, say: "Practical, well-made, and it fits on the shelf." } },
  },
  {
    afterMs: 200,
    event: { type: "score", payload: { spriteId: "daughter", score: 8, say: "Love that it's from a local maker." } },
  },
  {
    afterMs: 250,
    event: {
      type: "score",
      payload: {
        spriteId: "son",
        score: 7,
        say: "The desk lamp is still a conversation piece, at least.",
        complaint: "Still wish it was the giant arc lamp.",
      },
    },
  },
  { afterMs: 60, event: { type: "awaiting_mandate", payload: BUNDLE } },
] satisfies TimedCouncilEvent[];

export const STAGE_TRANSCRIPT = STAGE_TIMELINE.map((entry) => entry.event) satisfies CouncilEvent[];
