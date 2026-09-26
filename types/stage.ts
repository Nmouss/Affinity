import type { CouncilEvent } from "./domain";

// Frontend-only contracts shared by the stage, hands, and director tracks.
// Agent-side contracts stay in types/domain.ts.

/** Where the demo is. lobby, convening, and signing are local; the rest follow CouncilEvents. */
export type StagePhase =
  | "lobby"
  | "convening"
  | "opinions"
  | "merge"
  | "conflict"
  | "bundle"
  | "scoring"
  | "awaitMandate"
  | "signing"
  | "receipt";

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
  | "celebrating";

/** Anything the hand can point at. Registered in lib/stage/targets.ts by whoever renders it. */
export type TargetId =
  | `sprite:${string}`
  | `seat:${number}`
  | "hearth"
  | "tree"
  | `item:${string}`
  | `anchor:${number}`;

export type InputSource = "leap" | "replay" | "mediapipe" | "keyboard";

/** Semantic gestures. Hands emits them on lib/stage/bus.ts; the director consumes them. */
export type GestureEvent =
  | { type: "hover"; target: TargetId | null }
  | { type: "pinchTap"; target: TargetId }
  | { type: "dragStart"; spriteId: string }
  | { type: "dragEnd"; spriteId: string; seat: number | null }
  | { type: "seat"; spriteId: string }
  | { type: "orbit"; dx: number; dy: number }
  | { type: "swipe"; itemId: string }
  | { type: "handshakeProgress"; progress: number }
  | { type: "handshakeComplete" }
  | { type: "convene" }
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

export interface LoggedCouncilEvent {
  event: CouncilEvent;
  /** performance.now() when the event was applied. */
  at: number;
}
