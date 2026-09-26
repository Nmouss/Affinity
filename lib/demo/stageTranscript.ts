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
    { id: "tree-4ft", slot: "tree", name: "4 ft pre-lit tree", price: 89, heightIn: 48, tags: ["compact", "warm white"] },
    { id: "orn-doll", slot: "ornaments", name: "Doll ornament set", price: 26, tags: ["dolls", "pink", "sparkle"] },
    { id: "orn-dino", slot: "ornaments", name: "Dinosaur ornament set", price: 28, tags: ["dinosaurs"] },
    { id: "orn-gold", slot: "ornaments", name: "White and gold ornament set", price: 24, tags: ["white and gold decor"] },
    { id: "topper-star", slot: "topper", name: "Gold star topper", price: 15, tags: ["sparkle"] },
  ],
  total: 182,
  serves: { wife: ["tree-4ft", "orn-gold"], daughter: ["orn-doll", "topper-star"], son: ["orn-dino"] },
};

export const STAGE_TIMELINE = [
  {
    afterMs: 1400,
    event: {
      type: "opinion",
      payload: {
        spriteId: "wife",
        say: "Warm and elegant, please—and no taller than four feet.",
        hardRules: [{ type: "maxHeight", inches: 48, why: "The living room is small." }],
        wishes: ["warm lights", "white and gold decor"],
        vetoes: ["giant decorations"],
      },
    },
  },
  {
    afterMs: 350,
    event: {
      type: "opinion",
      payload: {
        spriteId: "daughter",
        say: "Can we make it pink and sparkly with dolls?",
        hardRules: [],
        wishes: ["dolls", "pink", "sparkle"],
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
        say: "I vote for a giant T-rex! Or at least lots of dinosaurs.",
        hardRules: [],
        wishes: ["giant inflatable T-rex", "dinosaurs"],
        vetoes: [],
      },
    },
  },
  {
    afterMs: 120,
    event: {
      type: "constraints",
      payload: {
        hardRules: [{ type: "maxHeight", inches: 48, why: "The living room is small." }],
        wishes: [
          { spriteId: "wife", wish: "warm lights", weight: 1 },
          { spriteId: "wife", wish: "white and gold decor", weight: 1 },
          { spriteId: "daughter", wish: "dolls", weight: 1 },
          { spriteId: "daughter", wish: "pink", weight: 1 },
          { spriteId: "daughter", wish: "sparkle", weight: 1 },
          { spriteId: "son", wish: "giant inflatable T-rex", weight: 1 },
          { spriteId: "son", wish: "dinosaurs", weight: 1 },
        ],
        conflicts: [
          { rule: "Maximum height: 48 inches", wish: "8 ft inflatable T-rex", resolution: "Use dinosaur ornaments instead." },
        ],
      },
    },
  },
  {
    afterMs: 40,
    event: {
      type: "veto",
      payload: { rule: "Maximum height: 48 inches", wish: "8 ft inflatable T-rex", resolution: "Use dinosaur ornaments instead." },
    },
  },
  { afterMs: 2600, event: { type: "bundle", payload: BUNDLE } },
  {
    afterMs: 900,
    event: { type: "score", payload: { spriteId: "wife", score: 9, say: "Warm, tidy, and it fits the corner." } },
  },
  {
    afterMs: 200,
    event: { type: "score", payload: { spriteId: "daughter", score: 8, say: "Pink dolls and a sparkly star!" } },
  },
  {
    afterMs: 250,
    event: {
      type: "score",
      payload: {
        spriteId: "son",
        score: 7,
        say: "Dinosaur ornaments are almost as cool as a T-rex.",
        complaint: "Still wish it was giant.",
      },
    },
  },
  { afterMs: 60, event: { type: "awaiting_mandate", payload: BUNDLE } },
] satisfies TimedCouncilEvent[];

export const STAGE_TRANSCRIPT = STAGE_TIMELINE.map((entry) => entry.event) satisfies CouncilEvent[];
