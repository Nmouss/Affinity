import type { StateCreator } from "zustand";
import family from "@/data/family.json";
import type {
  Bundle,
  CartMandate,
  ConstraintSet,
  CouncilEvent,
  FamilyProfile,
  SpriteOpinion,
  SpriteScore,
} from "@/types/domain";
import type {
  ConflictAttribution,
  LoggedCouncilEvent,
  SpriteMood,
  SpriteStageState,
  StagePhase,
} from "@/types/stage";
import type { StageStore } from "../store";

// Owned by the director track. This is the minimal reducer the lab stepper needs; the director
// adds pacing, veto attribution, and mandate handling on top.

export const FAMILY = family as FamilyProfile[];

export interface CouncilSlice {
  phase: StagePhase;
  missionText: string;
  sprites: Record<string, SpriteStageState>;
  opinions: Record<string, SpriteOpinion>;
  constraints: ConstraintSet | null;
  veto: ConstraintSet["conflicts"][number] | null;
  /** Set by the director when a veto arrives; null until then. */
  conflict: ConflictAttribution | null;
  bundle: Bundle | null;
  scores: Record<string, SpriteScore>;
  mandate: CartMandate | null;
  receiptId: string | null;
  reasoningVisible: boolean;
  profileOpenId: string | null;
  eventLog: LoggedCouncilEvent[];
  applyCouncilEvent: (event: CouncilEvent) => void;
  setPhase: (phase: StagePhase) => void;
  setConflict: (conflict: ConflictAttribution | null) => void;
  setSpriteMood: (spriteId: string, mood: SpriteMood) => void;
  seatSprite: (spriteId: string, seat: number | null) => void;
  resetCouncil: () => void;
}

function initialSprites(): Record<string, SpriteStageState> {
  return Object.fromEntries(
    FAMILY.map((profile) => [profile.id, { mood: "idle", seat: null, bubble: null, score: null }]),
  );
}

function initialCouncil() {
  return {
    phase: "lobby" as StagePhase,
    missionText: "Family Christmas tree, under $200",
    sprites: initialSprites(),
    opinions: {},
    constraints: null,
    veto: null,
    conflict: null,
    bundle: null,
    scores: {},
    mandate: null,
    receiptId: null,
    reasoningVisible: false,
    profileOpenId: null,
    eventLog: [],
  };
}

function patchSprite(
  sprites: Record<string, SpriteStageState>,
  spriteId: string,
  patch: Partial<SpriteStageState>,
): Record<string, SpriteStageState> {
  const current = sprites[spriteId] ?? { mood: "idle", seat: null, bubble: null, score: null };
  return { ...sprites, [spriteId]: { ...current, ...patch } };
}

export const createCouncilSlice: StateCreator<StageStore, [], [], CouncilSlice> = (set) => ({
  ...initialCouncil(),

  applyCouncilEvent: (event) =>
    set((state) => {
      const eventLog = [...state.eventLog, { event, at: performance.now() }];
      switch (event.type) {
        case "opinion":
          return {
            eventLog,
            phase: "opinions",
            opinions: { ...state.opinions, [event.payload.spriteId]: event.payload },
            sprites: patchSprite(state.sprites, event.payload.spriteId, {
              mood: "speaking",
              bubble: event.payload.say,
            }),
          };
        case "constraints":
          return { eventLog, phase: "merge", constraints: event.payload };
        case "veto":
          return { eventLog, phase: "conflict", veto: event.payload };
        case "bundle":
          return { eventLog, phase: "bundle", bundle: event.payload };
        case "score":
          return {
            eventLog,
            phase: "scoring",
            scores: { ...state.scores, [event.payload.spriteId]: event.payload },
            sprites: patchSprite(state.sprites, event.payload.spriteId, {
              mood: event.payload.score >= 7 ? "happy" : event.payload.score < 6 ? "sad" : "listening",
              bubble: event.payload.say,
              score: event.payload.score,
            }),
          };
        case "awaiting_mandate":
          return { eventLog, phase: "awaitMandate", bundle: event.payload };
        case "receipt":
          return { eventLog, phase: "receipt", mandate: event.payload };
      }
    }),

  setPhase: (phase) => set({ phase }),

  setConflict: (conflict) => set({ conflict }),

  setSpriteMood: (spriteId, mood) => set((state) => ({ sprites: patchSprite(state.sprites, spriteId, { mood }) })),

  seatSprite: (spriteId, seat) =>
    set((state) => ({
      sprites: patchSprite(state.sprites, spriteId, { seat, mood: seat === null ? "idle" : "seated" }),
    })),

  resetCouncil: () => set(initialCouncil()),
});
