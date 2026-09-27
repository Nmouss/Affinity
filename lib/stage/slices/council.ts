import type { StateCreator } from "zustand";
import catalog from "@/data/catalog.json";
import { attributeVeto } from "@/lib/director/attribution";
import { nextPhase, type PhaseInput } from "@/lib/director/phase";
import { getCircle, getPeople, getPerson, lobbySpot, useRoster } from "@/lib/people/roster";
import { DOORWAY, guestSpot, type Vec3 } from "@/lib/stage/layout";
import {
  mandateBundle,
  type Bundle,
  type CartMandate,
  type CatalogItem,
  type CommerceCart,
  type ConstraintSet,
  type CouncilEvent,
  type CouncilReceipt,
  type MandateInterrupt,
  type Mission,
  type Preflight,
  type ProposalRepair,
  type Revision,
  type SearchPlan,
  type SpriteDeliberation,
  type SpriteOpinion,
  type SpriteScore,
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

/** Where the backend thread is. `error` keeps the thread so a retry can resume it. */
export type RunStatus = "idle" | "running" | "interrupted" | "complete" | "error";

export interface CouncilSlice {
  phase: StagePhase;
  missionText: string;
  sprites: Record<string, SpriteStageState>;
  opinions: Record<string, SpriteOpinion>;
  deliberations: Record<string, SpriteDeliberation>;
  constraints: ConstraintSet | null;
  veto: ConstraintSet["conflicts"][number] | null;
  /** Set when a veto arrives (explicit fields from the agents, matching heuristics otherwise). */
  conflict: ConflictAttribution | null;
  searchPlan: SearchPlan | null;
  bundle: Bundle | null;
  scores: Record<string, SpriteScore>;
  revisions: Revision[];
  repair: ProposalRepair | null;
  preflight: Preflight | null;
  /** The browser's signed approval proof; its signature resumed the thread. */
  mandate: CartMandate | null;
  /** The backend's terminal receipt (approved or rejected). */
  receipt: CouncilReceipt | null;
  /** Merchant carts from the post-approval `carts` event or terminal run_state. Never discovery links. */
  carts: CommerceCart[];
  reasoningVisible: boolean;
  profileOpenId: string | null;
  eventLog: LoggedCouncilEvent[];
  /** The intent sent to /api/council on convene (replaced by the backend's normalized mission). */
  mission: Mission | null;
  /** The LangGraph thread this council runs on; approvals must resume exactly this id. */
  threadId: string | null;
  runStatus: RunStatus;
  /** The interrupt the backend is paused on, when it sent one. */
  interrupt: MandateInterrupt | null;
  /** Which transport is feeding the council, for the HUD pip. */
  councilSource: CouncilSource | null;
  /** Date.now() when the current bundle first appeared; arms the handshake after a settle time. */
  bundleShownAt: number | null;
  /** Sprite whose reasoning is highlighted after a pinch outside the lobby. */
  reasoningFocusId: string | null;
  /** Friend ids currently in the living room (walked in from the doorway, seated or not). Family
   *  are always present and never appear here. */
  visitors: string[];
  error: string | null;
  /** True when the last failure can be retried without starting over (the thread is still alive). */
  retryable: boolean;
  /** A friendly, non-error status line: price changed, finding a replacement, and so on. */
  notice: string | null;
  applyCouncilEvent: (event: CouncilEvent) => void;
  setPhase: (phase: StagePhase) => void;
  /** Moves the phase through the phase machine (lib/director/phase.ts). */
  advancePhase: (input: PhaseInput) => void;
  setConflict: (conflict: ConflictAttribution | null) => void;
  setSpriteMood: (spriteId: string, mood: SpriteMood) => void;
  /** Sets the mood of every participant at once (thinking while the council searches, and so on). */
  setParticipantMoods: (mood: SpriteMood) => void;
  /** Seats or unseats a sprite. Seating a friend who isn't visiting yet makes them visit. */
  seatSprite: (spriteId: string, seat: number | null) => void;
  setMissionText: (text: string) => void;
  setMission: (mission: Mission | null) => void;
  setThread: (threadId: string | null) => void;
  setRunStatus: (status: RunStatus) => void;
  setCouncilSource: (source: CouncilSource | null) => void;
  setError: (error: string | null, retryable?: boolean) => void;
  setNotice: (notice: string | null) => void;
  setMandate: (mandate: CartMandate | null) => void;
  openProfile: (spriteId: string | null) => void;
  setReasoningFocus: (spriteId: string | null) => void;
  toggleReasoning: () => void;
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
    missionText: "Family Christmas tree, under $200",
    sprites: initialSprites(),
    opinions: {},
    deliberations: {},
    constraints: null,
    veto: null,
    conflict: null,
    searchPlan: null,
    bundle: null,
    scores: {},
    revisions: [] as Revision[],
    repair: null,
    preflight: null,
    mandate: null,
    receipt: null,
    carts: [] as CommerceCart[],
    reasoningVisible: false,
    profileOpenId: null,
    eventLog: [],
    mission: null,
    threadId: null,
    runStatus: "idle" as RunStatus,
    interrupt: null,
    councilSource: null,
    bundleShownAt: null,
    reasoningFocusId: null,
    visitors: [] as string[],
    error: null,
    retryable: false,
    notice: null,
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

const quietSpeakers = (sprites: Record<string, SpriteStageState>, except?: string) =>
  mapSprites(sprites, (id, sprite) => (sprite.mood === "speaking" && id !== except ? { mood: "listening" } : null));

const moodAll = (sprites: Record<string, SpriteStageState>, participants: string[], mood: SpriteMood) =>
  mapSprites(sprites, (id) => (participants.includes(id) ? { mood } : null));

/** Same items at the same total: the proposal the user is looking at, not a revised one. */
export function sameProposal(a: Bundle | null, b: Bundle | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.total !== b.total || a.items.length !== b.items.length) return false;
  return a.items.every((item, index) => item.id === b.items[index]?.id && item.price === b.items[index]?.price);
}

/** What the HUD says about a preflight result. `ready` needs no line: the receipt follows at once. */
export function preflightNotice(preflight: Preflight): string | null {
  switch (preflight.status) {
    case "changed":
      return `Prices changed since you looked: ${preflight.changes.join(" ")} Please approve the refreshed cart again.`;
    case "repair":
      return `${preflight.changes.join(" ")} The council is finding a replacement.`;
    default:
      return null;
  }
}

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
        const phase = nextPhase(state.phase, event.type, state.bundle !== null);
        const participants = participantIds(state);
        switch (event.type) {
          case "mission":
            // The backend's normalized mission (slots inferred, budget coerced) replaces the draft.
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
          case "constraints":
          case "consensus":
            return { eventLog, phase, constraints: event.payload, sprites: quietSpeakers(state.sprites) };
          case "deliberation": {
            const { spriteId, say, replyToSpriteIds } = event.payload;
            if (!alive(spriteId)) return { eventLog, phase };
            let sprites = quietSpeakers(state.sprites, spriteId);
            for (const id of replyToSpriteIds) if (alive(id) && id !== spriteId) sprites = patchSprite(sprites, id, { mood: "listening" });
            return {
              eventLog,
              phase,
              deliberations: { ...state.deliberations, [spriteId]: event.payload },
              sprites: patchSprite(sprites, spriteId, { mood: "speaking", bubble: say }),
            };
          }
          case "veto": {
            const conflict = attributeVeto(event.payload, state.opinions, getPeople(), CATALOG);
            let sprites = quietSpeakers(state.sprites);
            if (alive(conflict.ruleBy)) sprites = patchSprite(sprites, conflict.ruleBy, { mood: "vetoing" });
            if (alive(conflict.wishBy)) sprites = patchSprite(sprites, conflict.wishBy, { mood: "conceding" });
            return { eventLog, phase, veto: event.payload, conflict, sprites };
          }
          case "search_plan":
            return {
              eventLog,
              phase,
              searchPlan: event.payload,
              notice: state.repair ? state.notice : null,
              sprites: moodAll(quietSpeakers(state.sprites), participants, "thinking"),
            };
          case "bundle":
            // A fresh proposal (first or revised): old scores no longer describe it.
            return {
              eventLog,
              phase,
              bundle: event.payload,
              bundleShownAt: Date.now(),
              scores: {},
              repair: null,
              notice: null,
              sprites: moodAll(state.sprites, participants, "scoring"),
            };
          case "score": {
            const { spriteId, score, say } = event.payload;
            if (!alive(spriteId)) return { eventLog, phase };
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
          case "revision": {
            const { spriteId, complaint } = event.payload;
            let sprites = moodAll(state.sprites, participants, "thinking");
            if (alive(spriteId)) sprites = patchSprite(sprites, spriteId, { mood: "concerned", bubble: complaint });
            return {
              eventLog,
              phase,
              revisions: [...state.revisions, event.payload],
              notice: "The council wants a better fit and is looking again.",
              sprites,
            };
          }
          case "scores_complete":
            return { eventLog, phase };
          case "awaiting_mandate": {
            const bundle = mandateBundle(event.payload) ?? state.bundle;
            const interrupt = "type" in event.payload ? event.payload : state.interrupt;
            // Resuming re-enters the mandate node, which re-emits the proposal we just approved before
            // moving on to preflight. That echo must not re-arm the handshake or move the phase back.
            if (state.phase === "signing" && sameProposal(bundle, state.bundle)) return { eventLog, interrupt };
            // A re-interrupt after preflight carries a refreshed cart: it needs fresh settle time too.
            const refreshed = !sameProposal(bundle, state.bundle);
            return {
              eventLog,
              phase,
              bundle,
              interrupt,
              runStatus: "interrupted",
              retryable: false,
              bundleShownAt: refreshed || state.bundleShownAt === null ? Date.now() : state.bundleShownAt,
              sprites: mapSprites(state.sprites, (id, sprite) =>
                participants.includes(id) && (sprite.mood === "thinking" || sprite.mood === "concerned") ? { mood: "listening" } : null,
              ),
            };
          }
          case "repair_requested":
            return { eventLog, phase, sprites: moodAll(state.sprites, participants, "thinking") };
          case "repair":
            return {
              eventLog,
              phase,
              repair: event.payload,
              scores: {},
              notice: event.payload.autonomous
                ? "Finding a replacement the council agrees on…"
                : `Finding a replacement: ${event.payload.prompt}`,
              sprites: moodAll(state.sprites, participants, "thinking"),
            };
          case "preflight": {
            const notice = preflightNotice(event.payload);
            return {
              eventLog,
              phase,
              preflight: event.payload,
              notice,
              sprites: moodAll(state.sprites, participants, event.payload.status === "ready" ? "listening" : "concerned"),
            };
          }
          case "receipt": {
            const approved = event.payload.status === "approved";
            return {
              eventLog,
              phase,
              receipt: event.payload,
              runStatus: approved ? state.runStatus : "complete",
              notice: approved ? null : "The council's proposal was declined. Nothing was added to a cart.",
              sprites: moodAll(state.sprites, participants, approved ? "celebrating" : "listening"),
            };
          }
          case "carts":
            return {
              eventLog,
              phase,
              carts: event.payload,
              notice: null,
              sprites: moodAll(state.sprites, participants, "celebrating"),
            };
          case "notifications":
          case "plan":
            return { eventLog, phase };
          case "run_state": {
            const run = event.payload;
            const interrupt = run.interrupts[0]?.value ?? null;
            const bundle = interrupt?.bundle ?? run.state.bundle ?? state.bundle;
            const carts = state.carts.length > 0 ? state.carts : run.state.carts ?? [];
            const receipt = state.receipt ?? run.state.receipt ?? null;
            let nextStagePhase = phase;
            if (run.status === "interrupted" && interrupt) nextStagePhase = nextPhase(phase, "awaiting_mandate", bundle !== null);
            else if (run.status === "complete" && carts.length > 0) nextStagePhase = nextPhase(phase, "carts");
            return {
              eventLog,
              phase: nextStagePhase,
              threadId: run.threadId,
              runStatus: run.status,
              interrupt: run.status === "interrupted" ? interrupt : null,
              bundle,
              carts,
              receipt,
              retryable: false,
              bundleShownAt: state.bundleShownAt ?? (bundle ? Date.now() : null),
            };
          }
          case "error": {
            const { detail, status } = event.payload;
            // A failed approval returns to the mandate so the same thread can be resumed again.
            const fallback = state.phase === "signing" ? nextPhase(state.phase, "mandateRejected") : phase;
            return {
              eventLog,
              phase: fallback,
              runStatus: "error",
              retryable: status !== 422,
              error: detail,
              sprites: mapSprites(state.sprites, (id, sprite) =>
                participants.includes(id) && (sprite.mood === "thinking" || sprite.mood === "speaking" || sprite.mood === "scoring")
                  ? { mood: "listening" }
                  : null,
              ),
            };
          }
        }
      }),

    setPhase: (phase) => set({ phase }),

    advancePhase: (input) => set((state) => ({ phase: nextPhase(state.phase, input, state.bundle !== null) })),

    setConflict: (conflict) => set({ conflict }),

    setSpriteMood: (spriteId, mood) => set((state) => ({ sprites: patchSprite(state.sprites, spriteId, { mood }) })),

    setParticipantMoods: (mood) => set((state) => ({ sprites: moodAll(state.sprites, participantIds(state), mood) })),

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

    setMission: (mission) => set({ mission }),

    setThread: (threadId) => set({ threadId }),

    setRunStatus: (runStatus) => set({ runStatus }),

    setCouncilSource: (councilSource) => set({ councilSource }),

    setError: (error, retryable = false) => set({ error, retryable: error ? retryable : false }),

    setNotice: (notice) => set({ notice }),

    setMandate: (mandate) => set({ mandate }),

    openProfile: (profileOpenId) => set({ profileOpenId }),

    setReasoningFocus: (reasoningFocusId) => set({ reasoningFocusId }),

    toggleReasoning: () => set((state) => ({ reasoningVisible: !state.reasoningVisible })),

    resetCouncil: () => set(initialCouncil()),
  };
};
