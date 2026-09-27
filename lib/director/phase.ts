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

const EVENT_PHASE: Partial<Record<CouncilEvent["type"], StagePhase>> = {
  mission: "convening",
  opinion: "opinions",
  deliberation: "opinions",
  constraints: "merge",
  consensus: "merge",
  search_plan: "merge",
  veto: "conflict",
  bundle: "bundle",
  plan: "bundle",
  score: "scoring",
  awaiting_mandate: "awaitMandate",
  receipt: "receipt",
};

/** Once the human has acted, late agent events may still update data but never move the phase. */
const LOCKED: readonly StagePhase[] = ["signing", "receipt"];

export function nextPhase(phase: StagePhase, input: PhaseInput, hasBundle = false): StagePhase {
  // Preflight can require fresh consent after an approval attempt, so the backend is allowed to
  // re-enter the mandate screen while the local UI is in its signing phase.
  if (input === "awaiting_mandate") return "awaitMandate";
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
    case "receipt":
      return "receipt";
    default:
      return LOCKED.includes(phase) ? phase : (EVENT_PHASE[input] ?? phase);
  }
}
