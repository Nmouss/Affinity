import { buildGiftMission, DEFAULT_BUDGET } from "@/lib/director/mission";
import type { Mission } from "@/types/domain";

// Pure state machine for the home hub's gift flow: Home → pick the recipient → pick advisors →
// details (budget, what to look for) → gather. UI components dispatch actions; nothing here touches
// the DOM, three.js, or the stores, so the whole flow is exercised in giftFlow.test.ts.

export type HubStep = "home" | "recipient" | "advisors" | "details";

export type PickRole = "recipient" | "advisor";

export interface GiftFlowState {
  step: HubStep;
  recipientId: string | null;
  /** In pick order; never contains the recipient. */
  advisorIds: string[];
  budget: number;
  /** What the shopper should look for; empty means "use the default for this recipient". */
  query: string;
  note: string;
}

export const DEFAULT_GIFT_BUDGET = 60;

export const initialGiftFlow: GiftFlowState = {
  step: "home",
  recipientId: null,
  advisorIds: [],
  budget: DEFAULT_GIFT_BUDGET,
  query: "",
  note: "",
};

export type GiftFlowAction =
  | { type: "startGift" }
  | { type: "pickPerson"; id: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "home" }
  | { type: "setBudget"; budget: number }
  | { type: "setQuery"; query: string }
  | { type: "setNote"; note: string };

export function giftFlowReducer(state: GiftFlowState, action: GiftFlowAction): GiftFlowState {
  switch (action.type) {
    case "startGift":
      return state.step === "home" ? { ...initialGiftFlow, budget: state.budget, step: "recipient" } : state;

    case "pickPerson": {
      if (state.step === "recipient") {
        return {
          ...state,
          recipientId: action.id,
          advisorIds: state.advisorIds.filter((id) => id !== action.id),
        };
      }
      if (state.step === "advisors") {
        if (action.id === state.recipientId) return state;
        const picked = state.advisorIds.includes(action.id);
        return { ...state, advisorIds: picked ? state.advisorIds.filter((id) => id !== action.id) : [...state.advisorIds, action.id] };
      }
      return state;
    }

    case "next":
      switch (state.step) {
        case "recipient":
          return state.recipientId ? { ...state, step: "advisors" } : state;
        case "advisors":
          return { ...state, step: "details" };
        default:
          return state;
      }

    case "back":
      switch (state.step) {
        case "recipient":
          return { ...initialGiftFlow, budget: state.budget };
        case "advisors":
          return { ...state, step: "recipient" };
        case "details":
          return { ...state, step: "advisors" };
        default:
          return state;
      }

    case "home":
      return { ...initialGiftFlow, budget: state.budget };

    case "setBudget":
      return { ...state, budget: Number.isFinite(action.budget) ? Math.max(0, action.budget) : state.budget };

    case "setQuery":
      return { ...state, query: action.query };

    case "setNote":
      return { ...state, note: action.note };

    default:
      return state;
  }
}

/** The role a character currently holds in the picks, if any. */
export function roleOf(state: Pick<GiftFlowState, "recipientId" | "advisorIds">, id: string): PickRole | null {
  if (state.recipientId === id) return "recipient";
  if (state.advisorIds.includes(id)) return "advisor";
  return null;
}

/** Number keys pick characters in roster order: "1" is the first person, "9" the ninth; anything else is null. */
export function personForKey(key: string, orderedIds: readonly string[]): string | null {
  if (!/^[1-9]$/.test(key)) return null;
  return orderedIds[Number(key) - 1] ?? null;
}

/** What to look for when the user hasn't said: their learned taste when there is one, otherwise a friendly default. */
export function defaultQuery(tasteSummary: string | null | undefined, recipientName: string): string {
  const summary = tasteSummary?.trim();
  if (summary && !/still learning|nothing learned/i.test(summary)) return `something ${summary} for ${recipientName}`;
  return `a thoughtful Christmas gift for ${recipientName}`;
}

/** The gift mission for these picks. The recipient is always invited first; advisors follow in pick order. */
export function missionFromFlow(state: GiftFlowState, recipientName: string, tasteSummary?: string | null): Mission | null {
  if (!state.recipientId) return null;
  const query = state.query.trim() || defaultQuery(tasteSummary, recipientName);
  const note = state.note.trim();
  return buildGiftMission({
    recipientId: state.recipientId,
    advisorIds: state.advisorIds,
    budget: state.budget > 0 ? state.budget : DEFAULT_BUDGET,
    occasion: "Christmas",
    slotQuery: query,
    freeText: note ? `Christmas gift: ${query}. ${note}` : undefined,
  });
}

/** Where everyone stands while picking: the recipient steps to the front, advisors line up beside them,
 *  and everyone else waits in a loose arc at the back so the front stage stays clear. */
export const PICK_STAGE = {
  frontZ: 1.8,
  advisorZ: 1.4,
  advisorSpacing: 1.6,
  backZ: -2.8,
  backDepth: 1.2,
  backHalfWidth: 5,
} as const;

/** How far the whole line-up steps back while the details panel is open, so nobody hides behind it. */
export const DETAILS_STEP_BACK = 2.4;

export function formationForPicks(
  orderedIds: readonly string[],
  recipientId: string | null,
  advisorIds: readonly string[],
  stepBack = 0,
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (recipientId) out[recipientId] = [0, PICK_STAGE.frontZ - stepBack];
  advisorIds.forEach((id, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    const rank = Math.floor(index / 2) + 1;
    out[id] = [side * rank * PICK_STAGE.advisorSpacing, PICK_STAGE.advisorZ - stepBack];
  });
  const rest = orderedIds.filter((id) => !(id in out));
  rest.forEach((id, index) => {
    const t = rest.length === 1 ? 0.5 : index / (rest.length - 1);
    const x = -PICK_STAGE.backHalfWidth + t * 2 * PICK_STAGE.backHalfWidth;
    const z = PICK_STAGE.backZ - Math.abs(t - 0.5) * 2 * PICK_STAGE.backDepth * -1 - (index % 2) * 0.6;
    out[id] = [x, z];
  });
  return out;
}
