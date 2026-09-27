import type { StateCreator } from "zustand";
import catalog from "@/data/catalog.json";
import { attributeVeto } from "@/lib/director/attribution";
import { nextPhase, type PhaseInput } from "@/lib/director/phase";
import { getCircle, getPeople, getPerson, lobbySpot, useRoster } from "@/lib/people/roster";
import { DOORWAY, guestSpot, type Vec3 } from "@/lib/stage/layout";
import type {
  Bundle,
  CatalogItem,
  ConstraintSet,
  CouncilEvent,
  CommerceCart,
  Mission,
  NotificationDelivery,
  Plan,
  PreflightResult,
  ProposalRepair,
  ReceiptResult,
  SearchPlan,
  SignedMandate,
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
// veto attribution), so the lab stepper and the paced director produce the same picture. Sprites are
// keyed by roster id now (lib/people/roster.ts), not the old fixed family.json — CATALOG stays a
// static import since the catalog isn't user-editable.

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
  plan: Plan | null;
  searchPlan: SearchPlan | null;
  scores: Record<string, SpriteScore>;
  mandate: SignedMandate | null;
  receipt: ReceiptResult | null;
  carts: CommerceCart[];
  notifications: NotificationDelivery[];
  preflight: PreflightResult | null;
  repair: ProposalRepair | null;
  profileOpenId: string | null;
  eventLog: LoggedCouncilEvent[];
  /** The intent sent to /api/council on convene. */
  mission: Mission | null;
  /** Which transport is feeding the council, for the HUD pip. */
  councilSource: CouncilSource | null;
  /** Date.now() when the current bundle first appeared; arms the handshake after a settle time. */
  bundleShownAt: number | null;
  /** Backend-assigned id for the current graph run; needed to resume it for a swap. */
  threadId: string | null;
  /** Friend ids currently in the living room (walked in from the doorway, seated or not). Family
   *  are always present and never appear here. */
  visitors: string[];
  /** Who a shopping run is buying for (one product each). Empty for dinner plans. */
  recipientIds: string[];
  error: string | null;
  applyCouncilEvent: (event: CouncilEvent) => void;
  setPhase: (phase: StagePhase) => void;
  /** Moves the phase through the phase machine (lib/director/phase.ts). */
  advancePhase: (input: PhaseInput) => void;
  setConflict: (conflict: ConflictAttribution | null) => void;
  setSpriteMood: (spriteId: string, mood: SpriteMood) => void;
  /** Seats or unseats a sprite. Seating a friend who isn't visiting yet makes them visit. */
  seatSprite: (spriteId: string, seat: number | null) => void;
  setMissionText: (text: string) => void;
  setRecipientIds: (ids: string[]) => void;
  setMission: (mission: Mission | null) => void;
  setThreadId: (threadId: string | null) => void;
  setMandate: (mandate: SignedMandate | null) => void;
  setCouncilSource: (source: CouncilSource | null) => void;
  setError: (error: string | null) => void;
  openProfile: (spriteId: string | null) => void;
  resetCouncil: () => void;
}

function blankSprite(): SpriteStageState {
  return { mood: "idle", seat: null, bubble: null, score: null };
}

function initialSprites(): Record<string, SpriteStageState> {
  return Object.fromEntries(getPeople().map((profile) => [profile.id, blankSprite()]));
}

function initialCouncil() {
  return {
    phase: "lobby" as StagePhase,
    missionText: "",
    sprites: initialSprites(),
    opinions: {},
    constraints: null,
    veto: null,
    conflict: null,
    bundle: null,
    plan: null,
    searchPlan: null,
    scores: {},
    mandate: null,
    receipt: null,
    carts: [],
    notifications: [],
    preflight: null,
    repair: null,
    profileOpenId: null,
    eventLog: [],
    mission: null,
    councilSource: null,
    bundleShownAt: null,
    threadId: null,
    visitors: [] as string[],
    recipientIds: [] as string[],
    error: null,
  };
}

/** True when `id` is still someone the roster knows — guards against reviving a removed person's
 *  sprite entry from a stale event (an in-flight/replayed event referencing them, e.g. after the
 *  People Maker deletes them mid-council). */
function alive(id: string | null): id is string {
  return id !== null && getPerson(id) !== undefined;
}

/** How many seats are currently taken; feeds lib/stage/layout.ts's activeSeatCount for the ring spread. */
export function seatedCount(sprites: Record<string, SpriteStageState>): number {
  return Object.values(sprites).filter((sprite) => sprite.seat !== null).length;
}

/**
 * Where a person stands when not seated. Family use their roster home spot; a visiting friend
 * stands at their guest spot, and a friend who isn't (or is no longer) visiting defaults to the
 * doorway — where SpriteToken spawns them, and where they walk to and vanish on reset.
 */
export function restSpot(id: string, visitors: string[]): Vec3 {
  if (getCircle(id) === "friend") {
    const index = visitors.indexOf(id);
    return index === -1 ? DOORWAY : guestSpot(index);
  }
  return lobbySpot(id);
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

/** Sprites taking part in this council: invited, seated, or already heard from. Filtered to people
 *  still in the roster, so a stale mission/opinion referencing someone since removed never revives
 *  a ghost sprite entry. */
export function participantIds(state: Pick<CouncilSlice, "sprites" | "opinions" | "mission">): string[] {
  const ids = new Set<string>(state.mission?.invitedSpriteIds ?? []);
  for (const [id, sprite] of Object.entries(state.sprites)) if (sprite.seat !== null) ids.add(id);
  for (const id of Object.keys(state.opinions)) ids.add(id);
  return [...ids].filter((id) => alive(id));
}

/** Only one line is on-stage at a time: previous speakers listen, and their bubbles drop so they
 *  cannot stack on top of the current speaker. */
const quietSpeakers = (sprites: Record<string, SpriteStageState>, except?: string) =>
  mapSprites(sprites, (id, sprite) => {
    if (id === except) return null;
    const patch: Partial<SpriteStageState> = {};
    if (sprite.mood === "speaking") patch.mood = "listening";
    if (sprite.bubble) patch.bubble = null;
    return Object.keys(patch).length ? patch : null;
  });

export const createCouncilSlice: StateCreator<StageStore, [], [], CouncilSlice> = (set) => {
  // Keeps `sprites`/`visitors` in sync with the roster: a new person gets a blank sprite entry, a
  // removed one has theirs (and any visiting status) dropped, so a stale event can never revive a
  // ghost. Membership-only check (not every roster field) so a name/look edit doesn't reset moods.
  let knownIds = new Set(getPeople().map((profile) => profile.id));
  useRoster.subscribe((state) => {
    const nextIds = new Set(state.people.map((profile) => profile.id));
    if (nextIds.size === knownIds.size && [...nextIds].every((id) => knownIds.has(id))) return;
    knownIds = nextIds;
    set((stage) => {
      const sprites: Record<string, SpriteStageState> = {};
      for (const id of nextIds) sprites[id] = stage.sprites[id] ?? blankSprite();
      return { sprites, visitors: stage.visitors.filter((id) => nextIds.has(id)) };
    });
  });

  return {
    ...initialCouncil(),

    applyCouncilEvent: (event) =>
      set((state) => {
        const eventLog = [...state.eventLog, { event, at: performance.now() }];
        const phase = nextPhase(state.phase, event.type, state.bundle !== null || state.plan !== null);
        switch (event.type) {
          case "mission":
            return { eventLog, phase, mission: event.payload };
          case "opinion": {
            const { spriteId, say } = event.payload;
            // A removed person's line is skipped entirely: no bubble, no ghost sprite entry, and
            // it never counts as an opinion (so participantIds and the reasoning panel skip them).
            if (!alive(spriteId)) return { eventLog, phase };
            return {
              eventLog,
              phase,
              opinions: { ...state.opinions, [spriteId]: event.payload },
              sprites: patchSprite(quietSpeakers(state.sprites, spriteId), spriteId, { mood: "speaking", bubble: say }),
            };
          }
          case "deliberation": {
            const { spriteId, say } = event.payload;
            if (!alive(spriteId)) return { eventLog, phase };
            return {
              eventLog,
              phase,
              sprites: patchSprite(quietSpeakers(state.sprites, spriteId), spriteId, {
                mood: "speaking",
                bubble: say,
              }),
            };
          }
          case "constraints":
            return { eventLog, phase, constraints: event.payload, sprites: quietSpeakers(state.sprites) };
          case "consensus":
            return { eventLog, phase, constraints: event.payload, sprites: quietSpeakers(state.sprites) };
          case "search_plan":
            return { eventLog, phase, searchPlan: event.payload, sprites: quietSpeakers(state.sprites) };
          case "veto": {
            const conflict = attributeVeto(event.payload, state.opinions, getPeople(), CATALOG);
            let sprites = quietSpeakers(state.sprites);
            if (alive(conflict.ruleBy)) sprites = patchSprite(sprites, conflict.ruleBy, { mood: "vetoing" });
            if (alive(conflict.wishBy)) sprites = patchSprite(sprites, conflict.wishBy, { mood: "conceding" });
            return { eventLog, phase, veto: event.payload, conflict, sprites };
          }
          case "bundle": {
            const participants = participantIds(state);
            return {
              eventLog,
              phase,
              bundle: event.payload,
              bundleShownAt: Date.now(),
              sprites: mapSprites(quietSpeakers(state.sprites), (id) =>
                participants.includes(id) ? { mood: "scoring" } : null,
              ),
            };
          }
          case "plan": {
            const participants = participantIds(state);
            return {
              eventLog,
              phase,
              plan: event.payload,
              bundleShownAt: Date.now(),
              sprites: mapSprites(quietSpeakers(state.sprites), (id) =>
                participants.includes(id) ? { mood: "scoring" } : null,
              ),
            };
          }
          case "score": {
            const { spriteId, score, say } = event.payload;
            if (!alive(spriteId)) return { eventLog, phase };
            return {
              eventLog,
              phase,
              scores: { ...state.scores, [spriteId]: event.payload },
              sprites: patchSprite(quietSpeakers(state.sprites, spriteId), spriteId, {
                mood: score >= 7 ? "happy" : score < 6 ? "sad" : "listening",
                bubble: say,
                score,
              }),
            };
          }
          case "revision":
            return { eventLog, phase, error: null };
          case "scores_complete":
            return { eventLog, phase, sprites: quietSpeakers(state.sprites) };
          case "awaiting_mandate":
            {
              const envelope = "requiredGesture" in event.payload ? event.payload : null;
              const legacyBundle: Bundle | undefined = envelope ? undefined : event.payload as Bundle;
            return {
              eventLog,
              phase,
              bundle: envelope?.bundle ?? legacyBundle ?? state.bundle,
              plan: envelope?.plan ?? state.plan,
              bundleShownAt: state.bundleShownAt ?? Date.now(),
              sprites: quietSpeakers(state.sprites),
            };
            }
          case "repair_requested":
            return { eventLog, phase };
          case "repair":
            return { eventLog, phase, repair: event.payload };
          case "preflight":
            return { eventLog, phase, preflight: event.payload };
          case "receipt": {
            const participants = participantIds(state);
            return {
              eventLog,
              phase,
              receipt: event.payload,
              sprites: mapSprites(quietSpeakers(state.sprites), (id) =>
                participants.includes(id) ? { mood: "celebrating" } : null,
              ),
            };
          }
          case "carts":
            return { eventLog, phase, carts: event.payload };
          case "notifications":
            return { eventLog, phase, notifications: event.payload };
          case "run_state":
            return { eventLog, phase, threadId: event.payload.threadId };
          case "error":
            return { eventLog, phase, error: event.payload.detail, sprites: quietSpeakers(state.sprites) };
        }
      }),

    setPhase: (phase) => set({ phase }),

    advancePhase: (input) => set((state) => ({ phase: nextPhase(state.phase, input, state.bundle !== null || state.plan !== null) })),

    setConflict: (conflict) => set({ conflict }),

    setSpriteMood: (spriteId, mood) => set((state) => ({ sprites: patchSprite(state.sprites, spriteId, { mood }) })),

    seatSprite: (spriteId, seat) =>
      set((state) => {
        // Seating a friend who isn't visiting yet makes them walk in from the doorway.
        const visitors =
          seat !== null && getCircle(spriteId) === "friend" && !state.visitors.includes(spriteId)
            ? [...state.visitors, spriteId]
            : state.visitors;
        return {
          visitors,
          sprites: patchSprite(state.sprites, spriteId, { seat, mood: seat === null ? "idle" : "seated" }),
        };
      }),

    setMissionText: (missionText) => set({ missionText }),

    setRecipientIds: (recipientIds) => set({ recipientIds: [...new Set(recipientIds)] }),

    setMission: (mission) => set({ mission }),

    setThreadId: (threadId) => set({ threadId }),

    setMandate: (mandate) => set({ mandate }),

    setCouncilSource: (councilSource) => set({ councilSource }),

    setError: (error) => set({ error }),

    openProfile: (profileOpenId) => set({ profileOpenId }),

    resetCouncil: () => set(initialCouncil()),
  };
};
