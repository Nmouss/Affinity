import type { StateCreator } from "zustand";
import catalog from "@/data/catalog.json";
import family from "@/data/family.json";
import { attributeVeto } from "@/lib/director/attribution";
import { nextPhase, type PhaseInput } from "@/lib/director/phase";
import type {
  Bundle,
  CartMandate,
  CatalogItem,
  ConstraintSet,
  CouncilEvent,
  FamilyProfile,
  Mission,
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

// Owned by the director track. applyCouncilEvent is the whole event → stage reducer (phase, moods,
// veto attribution), so the lab stepper and the paced director produce the same picture.

export const FAMILY = family as FamilyProfile[];
export const CATALOG = catalog as CatalogItem[];

export type CouncilSource = "live" | "replay";

export interface CouncilSlice {
  phase: StagePhase;
  missionText: string;
  sprites: Record<string, SpriteStageState>;
  opinions: Record<string, SpriteOpinion>;
  constraints: ConstraintSet | null;
  veto: ConstraintSet["conflicts"][number] | null;
  /** Set when a veto arrives (explicit fields from the agents, matching heuristics otherwise). */
  conflict: ConflictAttribution | null;
  bundle: Bundle | null;
  scores: Record<string, SpriteScore>;
  mandate: CartMandate | null;
  receiptId: string | null;
  reasoningVisible: boolean;
  profileOpenId: string | null;
  eventLog: LoggedCouncilEvent[];
  /** The intent sent to /api/council on convene. */
  mission: Mission | null;
  /** Which transport is feeding the council, for the HUD pip. */
  councilSource: CouncilSource | null;
  /** Date.now() when the current bundle first appeared; arms the handshake after a settle time. */
  bundleShownAt: number | null;
  /** Sprite whose reasoning is highlighted after a pinch outside the lobby. */
  reasoningFocusId: string | null;
  error: string | null;
  applyCouncilEvent: (event: CouncilEvent) => void;
  setPhase: (phase: StagePhase) => void;
  /** Moves the phase through the phase machine (lib/director/phase.ts). */
  advancePhase: (input: PhaseInput) => void;
  setConflict: (conflict: ConflictAttribution | null) => void;
  setSpriteMood: (spriteId: string, mood: SpriteMood) => void;
  seatSprite: (spriteId: string, seat: number | null) => void;
  setMissionText: (text: string) => void;
  setMission: (mission: Mission | null) => void;
  setCouncilSource: (source: CouncilSource | null) => void;
  setError: (error: string | null) => void;
  openProfile: (spriteId: string | null) => void;
  setReasoningFocus: (spriteId: string | null) => void;
  toggleReasoning: () => void;
  completeMandate: (receiptId: string, mandate: CartMandate) => void;
  resetCouncil: () => void;
}

function blankSprite(): SpriteStageState {
  return { mood: "idle", seat: null, bubble: null, score: null };
}

function initialSprites(): Record<string, SpriteStageState> {
  return Object.fromEntries(FAMILY.map((profile) => [profile.id, blankSprite()]));
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
    mission: null,
    councilSource: null,
    bundleShownAt: null,
    reasoningFocusId: null,
    error: null,
  };
}

function patchSprite(
  sprites: Record<string, SpriteStageState>,
  spriteId: string,
  patch: Partial<SpriteStageState>,
): Record<string, SpriteStageState> {
  return { ...sprites, [spriteId]: { ...(sprites[spriteId] ?? blankSprite()), ...patch } };
}

function mapSprites(
  sprites: Record<string, SpriteStageState>,
  update: (id: string, sprite: SpriteStageState) => Partial<SpriteStageState> | null,
): Record<string, SpriteStageState> {
  return Object.fromEntries(
    Object.entries(sprites).map(([id, sprite]) => {
      const patch = update(id, sprite);
      return [id, patch ? { ...sprite, ...patch } : sprite];
    }),
  );
}

/** Sprites taking part in this council: invited, seated, or already heard from. */
export function participantIds(state: Pick<CouncilSlice, "sprites" | "opinions" | "mission">): string[] {
  const ids = new Set<string>(state.mission?.invitedSpriteIds ?? []);
  for (const [id, sprite] of Object.entries(state.sprites)) if (sprite.seat !== null) ids.add(id);
  for (const id of Object.keys(state.opinions)) ids.add(id);
  return [...ids];
}

const quietSpeakers = (sprites: Record<string, SpriteStageState>, except?: string) =>
  mapSprites(sprites, (id, sprite) => (sprite.mood === "speaking" && id !== except ? { mood: "listening" } : null));

export const createCouncilSlice: StateCreator<StageStore, [], [], CouncilSlice> = (set) => ({
  ...initialCouncil(),

  applyCouncilEvent: (event) =>
    set((state) => {
      const eventLog = [...state.eventLog, { event, at: performance.now() }];
      const phase = nextPhase(state.phase, event.type, state.bundle !== null);
      switch (event.type) {
        case "opinion": {
          const { spriteId, say } = event.payload;
          return {
            eventLog,
            phase,
            opinions: { ...state.opinions, [spriteId]: event.payload },
            sprites: patchSprite(quietSpeakers(state.sprites, spriteId), spriteId, { mood: "speaking", bubble: say }),
          };
        }
        case "constraints":
          return { eventLog, phase, constraints: event.payload, sprites: quietSpeakers(state.sprites) };
        case "veto": {
          const conflict = attributeVeto(event.payload, state.opinions, FAMILY, CATALOG);
          let sprites = quietSpeakers(state.sprites);
          if (conflict.ruleBy) sprites = patchSprite(sprites, conflict.ruleBy, { mood: "vetoing" });
          if (conflict.wishBy) sprites = patchSprite(sprites, conflict.wishBy, { mood: "conceding" });
          return { eventLog, phase, veto: event.payload, conflict, sprites };
        }
        case "bundle": {
          const participants = participantIds(state);
          return {
            eventLog,
            phase,
            bundle: event.payload,
            bundleShownAt: Date.now(),
            sprites: mapSprites(state.sprites, (id) => (participants.includes(id) ? { mood: "scoring" } : null)),
          };
        }
        case "score": {
          const { spriteId, score, say } = event.payload;
          return {
            eventLog,
            phase,
            scores: { ...state.scores, [spriteId]: event.payload },
            sprites: patchSprite(state.sprites, spriteId, {
              mood: score >= 7 ? "happy" : score < 6 ? "sad" : "listening",
              bubble: say,
              score,
            }),
          };
        }
        case "awaiting_mandate":
          return { eventLog, phase, bundle: event.payload, bundleShownAt: state.bundleShownAt ?? Date.now() };
        case "receipt": {
          const participants = participantIds(state);
          return {
            eventLog,
            phase,
            mandate: event.payload,
            sprites: mapSprites(state.sprites, (id) => (participants.includes(id) ? { mood: "celebrating" } : null)),
          };
        }
      }
    }),

  setPhase: (phase) => set({ phase }),

  advancePhase: (input) => set((state) => ({ phase: nextPhase(state.phase, input, state.bundle !== null) })),

  setConflict: (conflict) => set({ conflict }),

  setSpriteMood: (spriteId, mood) => set((state) => ({ sprites: patchSprite(state.sprites, spriteId, { mood }) })),

  seatSprite: (spriteId, seat) =>
    set((state) => ({
      sprites: patchSprite(state.sprites, spriteId, { seat, mood: seat === null ? "idle" : "seated" }),
    })),

  setMissionText: (missionText) => set({ missionText }),

  setMission: (mission) => set({ mission }),

  setCouncilSource: (councilSource) => set({ councilSource }),

  setError: (error) => set({ error }),

  openProfile: (profileOpenId) => set({ profileOpenId }),

  setReasoningFocus: (reasoningFocusId) => set({ reasoningFocusId }),

  toggleReasoning: () => set((state) => ({ reasoningVisible: !state.reasoningVisible })),

  completeMandate: (receiptId, mandate) =>
    set((state) => {
      const participants = participantIds(state);
      return {
        receiptId,
        mandate,
        error: null,
        phase: nextPhase(state.phase, "mandateVerified"),
        sprites: mapSprites(state.sprites, (id) => (participants.includes(id) ? { mood: "celebrating" } : null)),
      };
    }),

  resetCouncil: () => set(initialCouncil()),
});
