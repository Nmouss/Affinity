import type { GestureType, StagePhase } from "@/types/stage";

export interface ArmingContext {
  phase: StagePhase;
  missionText: string;
  seatedCount: number;
  /** Date.now() when the current bundle first appeared, or null. */
  bundleShownAt: number | null;
  now: number;
}

/** The handshake (and swipe) only arm once the cart has been visible this long. */
export const BUNDLE_SETTLE_MS = 2000;

interface ArmingRule {
  phases: "all" | readonly StagePhase[];
  except?: readonly StagePhase[];
  when?: (context: ArmingContext) => boolean;
}

const bundleSettled = (context: ArmingContext) =>
  context.bundleShownAt !== null && context.now - context.bundleShownAt >= BUNDLE_SETTLE_MS;

export const ARMING_TABLE: Record<GestureType, ArmingRule> = {
  hover: { phases: "all" },
  reset: { phases: "all" },
  pinchTap: { phases: "all", except: ["signing"] },
  dragStart: { phases: ["lobby"] },
  dragEnd: { phases: ["lobby"] },
  seat: { phases: ["lobby"] },
  convene: {
    phases: ["lobby"],
    when: (context) => context.missionText.trim().length > 0 && context.seatedCount >= 1,
  },
  // The council stage is intentionally a fixed wide shot so every speaking agent remains visible.
  orbit: { phases: [] },
  swipe: { phases: ["awaitMandate"], when: bundleSettled },
  handshakeProgress: { phases: ["awaitMandate"], when: bundleSettled },
  handshakeComplete: { phases: ["awaitMandate"], when: bundleSettled },
};

export function isGestureArmed(type: GestureType, context: ArmingContext): boolean {
  const rule = ARMING_TABLE[type];
  if (rule.phases !== "all" && !rule.phases.includes(context.phase)) return false;
  if (rule.except?.includes(context.phase)) return false;
  return rule.when ? rule.when(context) : true;
}
