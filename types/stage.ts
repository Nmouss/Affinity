import type { CouncilEvent } from "./domain";

// Frontend-only contracts shared by the stage, hands, and director tracks.
// Agent-side contracts stay in types/domain.ts.

/**
 * Where the demo is. lobby, convening, and signing are local; the rest follow CouncilEvents.
 * preflight and checkout only occur on the live backend path (after an approval resumes the thread).
 */
export type StagePhase =
  | "lobby"
  | "convening"
  | "opinions"
  | "merge"
  | "deliberating"
  | "conflict"
  | "searching"
  | "bundle"
  | "scoring"
  | "revising"
  | "awaitMandate"
  | "signing"
  | "preflight"
  | "receipt"
  | "checkout";

export type SpriteMood =
  | "idle"
  | "hovered"
  | "held"
  | "seated"
  | "thinking"
  | "speaking"
  | "listening"
  | "vetoing"
  | "conceding"
  | "scoring"
  | "happy"
  | "sad"
  | "concerned"
  | "celebrating";

/** Anything the hand can point at. Registered in lib/stage/targets.ts by whoever renders it. */
export type TargetId =
  | `sprite:${string}`
  | `seat:${number}`
  | "hearth"
  | "tree"
  | `item:${string}`
  | `anchor:${number}`
  /** A DOM control the hand can point at (People Maker buttons); see data-hand-target. */
  | `ui:${string}`;

export type InputSource = "leap" | "replay" | "mediapipe" | "keyboard";

/** Semantic gestures. Hands emits them on lib/stage/bus.ts; the director consumes them. */
export type GestureEvent =
  | { type: "hover"; target: TargetId | null }
  | { type: "pinchTap"; target: TargetId }
  | { type: "dragStart"; spriteId: string }
  | { type: "dragEnd"; spriteId: string; seat: number | null }
  | { type: "seat"; spriteId: string }
  | { type: "orbit"; dx: number; dy: number }
  /** Push an item away: ask the council for a replacement. */
  | { type: "swipe"; itemId: string; prompt?: string }
  | { type: "handshakeProgress"; progress: number }
  | { type: "handshakeComplete" }
  | { type: "convene" }
  /** Decline the whole proposal; the run ends without a cart. */
  | { type: "reject" }
  /** Retry the last failed council request (start or resume) without losing the thread. */
  | { type: "retry" }
  | { type: "toggleReasoning" }
  | { type: "reset" };

export type GestureType = GestureEvent["type"];

export interface SpriteStageState {
  mood: SpriteMood;
  /** Council ring seat index, or null when the sprite is at its home spot. */
  seat: number | null;
  bubble: string | null;
  score: number | null;
}

/**
 * Who is on each side of a veto, filled in by the director from the `veto` event (explicit fields
 * when the agents send them, matching heuristics otherwise). Room and sprites render the beat from it.
 */
export interface ConflictAttribution {
  /** Sprite whose wish was vetoed (Leo in the demo). */
  wishBy: string | null;
  /** Sprite whose house rule vetoed it (Maya in the demo). */
  ruleBy: string | null;
  /** Catalog item that broke the rule (inflatable-trex). */
  itemId: string | null;
  /** Catalog item that resolves the conflict (orn-dino). */
  resolvedItemId: string | null;
}

export interface LoggedCouncilEvent {
  event: CouncilEvent;
  /** performance.now() when the event was applied. */
  at: number;
}
