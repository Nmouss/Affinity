import type { CouncilEvent } from "@/types/domain";
import type { StagePhase } from "@/types/stage";

/** Everything that can move the stage between phases: agent events plus local director moments. */
export type PhaseInput =
  | CouncilEvent["type"]
  | "convene"
  | "streamEnd"
  | "handshakeComplete"
  | "mandateVerified"
  | "mandateRejected"
  | "reset";

/** Events that carry the show forward. Missing ones (mission, scores_complete, run_state, error…) update data only. */
const EVENT_PHASE: Partial<Record<CouncilEvent["type"], StagePhase>> = {
  opinion: "opinions",
  constraints: "merge",
  deliberation: "deliberating",
  consensus: "merge",
  veto: "conflict",
  search_plan: "searching",
  bundle: "bundle",
  score: "scoring",
  revision: "revising",
  repair_requested: "revising",
  repair: "revising",
  awaiting_mandate: "awaitMandate",
  preflight: "preflight",
  receipt: "receipt",
  carts: "checkout",
};

/**
 * While the approval is in flight, only the resumed thread's own events may move the phase: a late
 * opinion or score from the first segment must not pull the stage backwards.
 */
const RESUME_EVENTS: ReadonlySet<PhaseInput> = new Set<PhaseInput>([
  "preflight",
  "awaiting_mandate",
  "receipt",
  "carts",
  "repair",
  "repair_requested",
  "search_plan",
  "bundle",
]);

/** Nothing moves the stage on from a receipt except the carts that follow it (or a reset). */
const TERMINAL: readonly StagePhase[] = ["receipt", "checkout"];

export function nextPhase(phase: StagePhase, input: PhaseInput, hasBundle = false): StagePhase {
  switch (input) {
    case "reset":
      return "lobby";
    case "convene":
      return phase === "lobby" ? "convening" : phase;
    case "streamEnd":
      return hasBundle && (phase === "bundle" || phase === "scoring") ? "awaitMandate" : phase;
    case "handshakeComplete":
      return phase === "awaitMandate" ? "signing" : phase;
    case "mandateVerified":
      return phase === "signing" ? "receipt" : phase;
    case "mandateRejected":
      return phase === "signing" ? "awaitMandate" : phase;
    case "carts":
      return phase === "checkout" ? phase : "checkout";
    case "receipt":
      return phase === "checkout" ? phase : "receipt";
    case "awaiting_mandate":
      // A price change after approval re-interrupts: back to the mandate, fresh consent required.
      return TERMINAL.includes(phase) ? phase : "awaitMandate";
    default:
      if (phase === "signing" && !RESUME_EVENTS.has(input)) return phase;
      if (TERMINAL.includes(phase)) return phase;
      return EVENT_PHASE[input] ?? phase;
  }
}
