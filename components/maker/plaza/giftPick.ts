// Pure state for picking a gift's people right in the Plaza: first who the gift is for, then who's
// buying it (the characters who weigh in). The scene reads it to line people up and badge them; the
// rails read it for the bottom bar. No DOM, three.js, or stores here — see giftPick.test.ts.

export type GiftPickStep = "recipient" | "buyers";
export type GiftRole = "recipient" | "buyer";

export interface GiftPickState {
  step: GiftPickStep;
  recipientId: string | null;
  /** In pick order; never contains the recipient. */
  buyerIds: string[];
}

export function startGiftPick(prefillBuyerIds: readonly string[] = []): GiftPickState {
  return { step: "recipient", recipientId: null, buyerIds: [...new Set(prefillBuyerIds)] };
}

/** Clicking a character: on the first step they become the recipient; on the second they toggle as a buyer. */
export function pickGiftPerson(state: GiftPickState, id: string): GiftPickState {
  if (state.step === "recipient") {
    return { ...state, recipientId: id, buyerIds: state.buyerIds.filter((buyer) => buyer !== id) };
  }
  if (id === state.recipientId) return state;
  const picked = state.buyerIds.includes(id);
  return { ...state, buyerIds: picked ? state.buyerIds.filter((buyer) => buyer !== id) : [...state.buyerIds, id] };
}

/** Enter / the primary button: needs a recipient before moving on to buyers. */
export function giftPickNext(state: GiftPickState): GiftPickState {
  if (state.step === "recipient" && state.recipientId) return { ...state, step: "buyers" };
  return state;
}

/** Escape / Back: from buyers to recipient; from recipient, null means "leave picking". */
export function giftPickBack(state: GiftPickState): GiftPickState | null {
  return state.step === "buyers" ? { ...state, step: "recipient" } : null;
}

export function giftRoleOf(state: Pick<GiftPickState, "recipientId" | "buyerIds">, id: string): GiftRole | null {
  if (state.recipientId === id) return "recipient";
  if (state.buyerIds.includes(id)) return "buyer";
  return null;
}

/** Everyone the council invites, recipient first so they sit by the hearth. */
export function invitedForPicks(state: GiftPickState): string[] {
  return state.recipientId ? [state.recipientId, ...state.buyerIds.filter((id) => id !== state.recipientId)] : [];
}

/** Number keys pick characters in roster order: "1" is the first person, "9" the ninth; anything else is null. */
export function personForKey(key: string, orderedIds: readonly string[]): string | null {
  if (!/^[1-9]$/.test(key)) return null;
  return orderedIds[Number(key) - 1] ?? null;
}

/** Where everyone stands while picking (world ft): the recipient steps to the front, buyers line up
 *  beside them, and everyone else waits in a loose arc at the back so the front stage stays clear. */
export const PICK_STAGE = {
  frontZ: 1.8,
  buyerZ: 0.2,
  buyerSpacing: 2.4,
  backZ: -3,
  backDepth: 1.1,
  backHalfWidth: 5,
} as const;

export function formationForPicks(
  orderedIds: readonly string[],
  state: Pick<GiftPickState, "recipientId" | "buyerIds">,
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (state.recipientId) out[state.recipientId] = [0, PICK_STAGE.frontZ];
  state.buyerIds.forEach((id, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    const rank = Math.floor(index / 2) + 1;
    out[id] = [side * rank * PICK_STAGE.buyerSpacing, PICK_STAGE.buyerZ];
  });
  const rest = orderedIds.filter((id) => !(id in out));
  rest.forEach((id, index) => {
    const t = rest.length === 1 ? 0.5 : index / (rest.length - 1);
    const x = -PICK_STAGE.backHalfWidth + t * 2 * PICK_STAGE.backHalfWidth;
    // A shallow arc: the ends come forward a little, the middle stays furthest back.
    const z = PICK_STAGE.backZ + Math.abs(t - 0.5) * 2 * PICK_STAGE.backDepth - (index % 2) * 0.5;
    out[id] = [x, z];
  });
  return out;
}

/** The bottom bar's copy for each step. */
export function giftPickPrompt(state: GiftPickState, names: Record<string, string>): { title: string; hint: string } {
  if (state.step === "recipient") {
    return state.recipientId
      ? { title: `The gift is for ${names[state.recipientId] ?? "them"}`, hint: "Click someone else to change, or continue" }
      : { title: "Who is the gift for?", hint: "Click a character in the Plaza · number keys work too" };
  }
  const buyers = state.buyerIds.map((id) => names[id] ?? id);
  return buyers.length === 0
    ? { title: "Who's buying?", hint: "Click everyone who should help choose · you can skip this" }
    : { title: `${buyers.join(", ")} ${buyers.length === 1 ? "is" : "are"} buying`, hint: "Click to add or remove people, then gather the council" };
}
