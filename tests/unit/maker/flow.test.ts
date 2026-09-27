import { describe, expect, it, vi } from "vitest";
import { BODY_PRESETS, EYE_COLORS, SKIN_TONES } from "@/types/character";
import { STARTER_LOOKS } from "@/lib/people/starters";
import type { NewPerson, PersonPatch } from "@/lib/people/roster";
import type { TasteProfile } from "@/lib/taste";
import { TASTE_COMPARISONS } from "@/lib/taste";
import {
  contrastRatio,
  currentComparison,
  flowReducer,
  initialMakerState,
  MIN_EYE_CONTRAST,
  pickEyeColor,
  randomLook,
  sanitizeName,
  tasteProgress,
  toTitleCase,
  type FlowDeps,
  type MakerState,
} from "@/components/maker/flow";

function harness(tasteSeed: Record<string, TasteProfile> = {}) {
  const addPerson = vi.fn<(person: NewPerson) => string | null>(() => "new-id");
  const updatePerson = vi.fn<(id: string, patch: PersonPatch) => void>();
  const removePerson = vi.fn<(id: string) => void>();
  const tastes: Record<string, TasteProfile> = { ...tasteSeed };
  const getTaste = vi.fn<(id: string) => TasteProfile | undefined>((id) => tastes[id]);
  const setTaste = vi.fn<(id: string, profile: TasteProfile) => void>((id, profile) => {
    tastes[id] = profile;
  });
  let tick = 0;
  const now = () => `2026-09-26T00:00:${String(tick++).padStart(2, "0")}Z`;
  const deps: FlowDeps = { addPerson, updatePerson, removePerson, getTaste, setTaste, now };
  let state: MakerState = initialMakerState;
  return {
    addPerson,
    updatePerson,
    removePerson,
    getTaste,
    setTaste,
    tastes,
    get state() {
      return state;
    },
    dispatch(action: Parameters<typeof flowReducer>[1]) {
      state = flowReducer(state, action, deps);
      return state;
    },
  };
}

describe("flowReducer", () => {
  it("walks the full happy path from Plaza to a saved family grown-up", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    expect(h.state.step).toBe("who-circle");

    h.dispatch({ type: "pickCircle", circle: "family" });
    expect(h.state.step).toBe("who-size");

    h.dispatch({ type: "pickSize", size: "grownup" });
    expect(h.state.step).toBe("start");
    expect(h.state.draft?.relationship).toBe("grown-up");
    expect(h.state.draft?.look.body).toEqual(BODY_PRESETS.grownup);

    h.dispatch({ type: "startScratch" });
    expect(h.state.step).toBe("editor");

    h.dispatch({ type: "setColor", field: "bodyColor", color: "#8fd14f" });
    h.dispatch({ type: "setPart", part: "eyes", option: "sparkle" });
    h.dispatch({ type: "typeChar", char: "A" });
    h.dispatch({ type: "typeChar", char: "v" });
    h.dispatch({ type: "typeChar", char: "a" });
    expect(h.state.draft?.name).toBe("Ava");

    h.dispatch({ type: "save" });

    expect(h.addPerson).toHaveBeenCalledTimes(1);
    const saved = h.addPerson.mock.calls[0]![0];
    expect(saved).toMatchObject({
      name: "Ava",
      circle: "family",
      relationship: "grown-up",
    });
    expect(saved.look.bodyColor).toBe("#8fd14f");
    expect(saved.look.eyes.type).toBe("sparkle");
    // A brand-new person goes straight on to "teach it what you like", keeping their look on screen.
    expect(h.state.step).toBe("taste");
    expect(h.state.tasteId).toBe("new-id");
    expect(h.state.draft).toMatchObject({ name: "Ava", editingId: "new-id" });
  });

  it("relationship is 'friend' regardless of the size pick", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "friend" });
    h.dispatch({ type: "pickSize", size: "kid" });
    expect(h.state.draft?.relationship).toBe("friend");
    expect(h.state.draft?.look.body).toEqual(BODY_PRESETS.kid);
  });

  it("start from a preset copies the preset look but keeps the chosen body size", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "little" });
    h.dispatch({ type: "startPreset", key: "daughter" });

    expect(h.state.draft?.look.accessory).toEqual(STARTER_LOOKS.daughter!.accessory);
    expect(h.state.draft?.look.bodyColor).toBe(STARTER_LOOKS.daughter!.bodyColor);
    // Body comes from the who-size pick, not the preset.
    expect(h.state.draft?.look.body).toEqual(BODY_PRESETS.little);

    // Mutating the saved draft must never leak back into the frozen STARTER_LOOKS constant.
    h.dispatch({ type: "setColor", field: "bodyColor", color: "#000000" });
    expect(STARTER_LOOKS.daughter!.bodyColor).not.toBe("#000000");
  });

  it("random start produces a look built only from the frozen option sets", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    let counter = 0;
    const random = () => {
      const values = [0, 0.99, 0.5, 0.2, 0.8, 0.1, 0.6, 0.3];
      return values[counter++ % values.length]!;
    };
    h.dispatch({ type: "startRandom", random });
    expect(h.state.step).toBe("editor");
    expect(h.state.draft?.look.body).toEqual(BODY_PRESETS.grownup);
  });

  it("adjustEyes clamps at the ADJUST range (-1..1)", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });

    for (let i = 0; i < 10; i += 1) h.dispatch({ type: "adjustEyes", field: "size", delta: 0.25 });
    expect(h.state.draft?.look.eyes.size).toBe(1);

    for (let i = 0; i < 10; i += 1) h.dispatch({ type: "adjustEyes", field: "size", delta: -0.25 });
    expect(h.state.draft?.look.eyes.size).toBe(-1);
  });

  it("adjustBrows also clamps at the ADJUST range", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });

    for (let i = 0; i < 10; i += 1) h.dispatch({ type: "adjustBrows", delta: 1 });
    expect(h.state.draft?.look.brows.height).toBe(1);
  });

  it("Quit without Saving discards the draft and never calls addPerson", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });
    h.dispatch({ type: "typeChar", char: "X" });

    h.dispatch({ type: "quit" });
    expect(h.state.step).toBe("quit-dialog");

    h.dispatch({ type: "quitWithoutSaving" });
    expect(h.state.step).toBe("plaza");
    expect(h.state.draft).toBeNull();
    expect(h.addPerson).not.toHaveBeenCalled();
  });

  it("Cancel returns from the quit dialog to the editor with the draft intact", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });
    h.dispatch({ type: "typeChar", char: "X" });

    h.dispatch({ type: "quit" });
    h.dispatch({ type: "cancelDialog" });

    expect(h.state.step).toBe("editor");
    expect(h.state.draft?.name).toBe("X");
  });

  it("Save with an empty name redirects to the Name tab instead of saving", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });
    h.dispatch({ type: "setTab", tab: "body" });

    h.dispatch({ type: "save" });

    expect(h.addPerson).not.toHaveBeenCalled();
    expect(h.state.step).toBe("editor");
    expect(h.state.tab).toBe("name");
    expect(h.state.nameError).toBe(true);
  });

  it("editing an existing person updates rather than adds", () => {
    const h = harness();
    h.dispatch({
      type: "editPerson",
      id: "son",
      name: "Leo",
      circle: "family",
      relationship: "kid",
      look: STARTER_LOOKS.son!,
    });
    expect(h.state.step).toBe("editor");
    expect(h.state.draft?.editingId).toBe("son");

    h.dispatch({ type: "setColor", field: "accent", color: "#5bc8f0" });
    h.dispatch({ type: "save" });

    expect(h.addPerson).not.toHaveBeenCalled();
    expect(h.updatePerson).toHaveBeenCalledTimes(1);
    const [id, patch] = h.updatePerson.mock.calls[0]!;
    expect(id).toBe("son");
    expect(patch.name).toBe("Leo");
    expect(patch.look?.accent).toBe("#5bc8f0");
  });

  it("back steps out of the wizard one screen at a time, and out of who-circle clears the draft", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "kid" });
    expect(h.state.step).toBe("start");

    h.dispatch({ type: "back" });
    expect(h.state.step).toBe("who-size");

    h.dispatch({ type: "back" });
    expect(h.state.step).toBe("who-circle");

    h.dispatch({ type: "back" });
    expect(h.state.step).toBe("plaza");
    expect(h.state.draft).toBeNull();
  });

  it("the on-screen keyboard's uppercase keycaps still type Title Case names", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });

    // KEYBOARD_ROWS in EditorTabs are literal uppercase keycaps ("QWERTYUIOP"), so every
    // dispatched typeChar is an uppercase letter — sanitizeName must still produce "Sam Ann".
    for (const char of "SAM") h.dispatch({ type: "typeChar", char });
    h.dispatch({ type: "typeChar", char: " " });
    for (const char of "ANN") h.dispatch({ type: "typeChar", char });

    expect(h.state.draft?.name).toBe("Sam Ann");
  });

  it("setName (the free-text field) also normalizes to Title Case", () => {
    const h = harness();
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });

    h.dispatch({ type: "setName", name: "mcKENZIE" });
    expect(h.state.draft?.name).toBe("Mckenzie");
  });

  it("save() normalizes the name to Title Case even if the draft got one another way", () => {
    const h = harness();
    h.dispatch({
      type: "editPerson",
      id: "son",
      name: "leo garcia", // e.g. data saved before this feature existed
      circle: "family",
      relationship: "kid",
      look: STARTER_LOOKS.son!,
    });
    h.dispatch({ type: "save" });

    expect(h.updatePerson).toHaveBeenCalledTimes(1);
    const [, patch] = h.updatePerson.mock.calls[0]!;
    expect(patch.name).toBe("Leo Garcia");
  });

  it("toTitleCase capitalizes each word and lowercases the rest", () => {
    expect(toTitleCase("SAM")).toBe("Sam");
    expect(toTitleCase("mary ann")).toBe("Mary Ann");
    expect(toTitleCase("")).toBe("");
  });

  it("sanitizeName strips non-letters, clamps length, and Title Cases", () => {
    expect(sanitizeName("sa4m!!")).toBe("Sam");
    expect(sanitizeName("ABCDEFGHIJKLMNOP")).toBe("Abcdefghijkl"); // clamped to MAX_NAME_LENGTH (12) first
  });

  it("requestRemove opens the plaza confirm dialog; confirmRemove removes and clears it", () => {
    const h = harness();
    h.dispatch({ type: "requestRemove", id: "wife" });
    expect(h.state.plazaConfirmRemoveId).toBe("wife");
    expect(h.removePerson).not.toHaveBeenCalled();

    h.dispatch({ type: "confirmRemove" });
    expect(h.removePerson).toHaveBeenCalledWith("wife");
    expect(h.state.plazaConfirmRemoveId).toBeNull();
  });

  it("cancelRemove closes the dialog without removing anyone", () => {
    const h = harness();
    h.dispatch({ type: "requestRemove", id: "wife" });
    h.dispatch({ type: "cancelRemove" });
    expect(h.state.plazaConfirmRemoveId).toBeNull();
    expect(h.removePerson).not.toHaveBeenCalled();
  });

  it("confirmRemove with nothing pending is a no-op", () => {
    const h = harness();
    h.dispatch({ type: "confirmRemove" });
    expect(h.removePerson).not.toHaveBeenCalled();
  });

  it("leaving the plaza (newPerson/editPerson) clears any pending remove confirmation", () => {
    const h = harness();
    h.dispatch({ type: "requestRemove", id: "wife" });
    h.dispatch({ type: "newPerson" });
    expect(h.state.plazaConfirmRemoveId).toBeNull();
  });
});

describe("pickEyeColor / randomLook eye contrast", () => {
  it("picks an eye color that reads against every skin tone, across many random seeds", () => {
    for (const skin of SKIN_TONES) {
      const bestPossible = Math.max(...EYE_COLORS.map((color) => contrastRatio(color, skin)));
      for (let seed = 0; seed < 200; seed += 1) {
        const eye = pickEyeColor(skin, Math.random);
        const ratio = contrastRatio(eye, skin);
        // Either it clears the legibility bar outright, or (for the darkest skin tones, where no
        // EYE_COLORS option clears it) it's the best the fixed palette can do for this skin tone.
        expect(ratio >= MIN_EYE_CONTRAST || Math.abs(ratio - bestPossible) < 1e-9).toBe(true);
      }
    }
  });

  it("randomLook's eyes always come from EYE_COLORS and stay legible against the chosen skin", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const look = randomLook({ height: 1, build: 0.5 }, Math.random);
      expect(EYE_COLORS).toContain(look.eyes.color);
      const bestPossible = Math.max(...EYE_COLORS.map((color) => contrastRatio(color, look.skin)));
      const ratio = contrastRatio(look.eyes.color, look.skin);
      expect(ratio >= MIN_EYE_CONTRAST || Math.abs(ratio - bestPossible) < 1e-9).toBe(true);
    }
  });
});

describe("taste and meet steps", () => {
  function savedNewPerson(seed: Record<string, TasteProfile> = {}) {
    const h = harness(seed);
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "family" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });
    h.dispatch({ type: "setName", name: "Ava" });
    h.dispatch({ type: "save" });
    expect(h.state.step).toBe("taste");
    return h;
  }

  it("walks save → taste (10 pairs) → meet → plaza, persisting every choice by person id", () => {
    const h = savedNewPerson();
    const seen = new Set<string>();
    for (let index = 0; index < TASTE_COMPARISONS.length; index += 1) {
      const pair = currentComparison(h.tastes["new-id"]);
      expect(pair).not.toBeNull();
      expect(seen.has(pair!.id)).toBe(false);
      seen.add(pair!.id);
      expect(tasteProgress(h.tastes["new-id"])).toEqual({ done: index, total: TASTE_COMPARISONS.length });
      h.dispatch({ type: "tasteChoice", choice: index % 3 === 2 ? "neither" : index % 2 === 0 ? "left" : "right" });
    }
    expect(h.setTaste).toHaveBeenCalledTimes(TASTE_COMPARISONS.length);
    expect(h.setTaste.mock.calls.every(([id]) => id === "new-id")).toBe(true);
    expect(currentComparison(h.tastes["new-id"])).toBeNull();
    expect(h.state.step).toBe("meet");
    expect(h.tastes["new-id"]!.completedComparisonIds).toHaveLength(TASTE_COMPARISONS.length);

    h.dispatch({ type: "meetDone" });
    expect(h.state).toEqual(initialMakerState);
  });

  it("undo reopens the last pair exactly and is a no-op with nothing to undo", () => {
    const h = savedNewPerson();
    h.dispatch({ type: "tasteUndo" });
    expect(h.setTaste).not.toHaveBeenCalled();

    const first = currentComparison(undefined)!;
    h.dispatch({ type: "tasteChoice", choice: "left" });
    expect(tasteProgress(h.tastes["new-id"]).done).toBe(1);
    h.dispatch({ type: "tasteUndo" });
    expect(tasteProgress(h.tastes["new-id"]).done).toBe(0);
    expect(currentComparison(h.tastes["new-id"])?.id).toBe(first.id);
    expect(h.tastes["new-id"]!.traits).toEqual({});
    expect(h.state.step).toBe("taste");
  });

  it("'done for now' and Escape both end the lesson early at meet, keeping what was learned", () => {
    const h = savedNewPerson();
    h.dispatch({ type: "tasteChoice", choice: "right" });
    h.dispatch({ type: "tasteDone" });
    expect(h.state.step).toBe("meet");
    expect(tasteProgress(h.tastes["new-id"]).done).toBe(1);

    h.dispatch({ type: "back" });
    expect(h.state.step).toBe("plaza");

    const g = savedNewPerson();
    g.dispatch({ type: "back" });
    expect(g.state.step).toBe("meet");
  });

  it("teaches an existing person from the plaza and returns to the plaza afterwards", () => {
    const h = harness();
    h.dispatch({ type: "teachTaste", id: "son", name: "Leo", circle: "family", relationship: "kid", look: STARTER_LOOKS.son! });
    expect(h.state.step).toBe("taste");
    expect(h.state.tasteId).toBe("son");
    expect(h.state.draft).toMatchObject({ name: "Leo", editingId: "son" });
    h.dispatch({ type: "tasteChoice", choice: "left" });
    expect(h.setTaste.mock.calls[0]![0]).toBe("son");
    h.dispatch({ type: "tasteDone" });
    h.dispatch({ type: "meetDone" });
    expect(h.state.step).toBe("plaza");
    expect(h.addPerson).not.toHaveBeenCalled();
    expect(h.updatePerson).not.toHaveBeenCalled();
  });

  it("editing someone who already has a taste returns to the plaza; someone without one is taught", () => {
    const taught: TasteProfile = { version: 1, traits: {}, completedComparisonIds: ["c1"], updatedAt: "2026-01-01T00:00:00Z" };
    const h = harness({ son: taught });
    h.dispatch({ type: "editPerson", id: "son", name: "Leo", circle: "family", relationship: "kid", look: STARTER_LOOKS.son! });
    h.dispatch({ type: "save" });
    expect(h.updatePerson).toHaveBeenCalledTimes(1);
    expect(h.state.step).toBe("plaza");

    const g = harness();
    g.dispatch({ type: "editPerson", id: "son", name: "Leo", circle: "family", relationship: "kid", look: STARTER_LOOKS.son! });
    g.dispatch({ type: "save" });
    expect(g.state.step).toBe("taste");
    expect(g.state.tasteId).toBe("son");
  });

  it("stays in the plaza when the roster is full and nothing was saved", () => {
    const h = harness();
    h.addPerson.mockReturnValueOnce(null);
    h.dispatch({ type: "newPerson" });
    h.dispatch({ type: "pickCircle", circle: "friend" });
    h.dispatch({ type: "pickSize", size: "grownup" });
    h.dispatch({ type: "startScratch" });
    h.dispatch({ type: "setName", name: "Sam" });
    h.dispatch({ type: "save" });
    expect(h.state.step).toBe("plaza");
    expect(h.state.tasteId).toBeNull();
  });

  it("ignores taste actions outside the taste step", () => {
    const h = harness();
    h.dispatch({ type: "tasteChoice", choice: "left" });
    h.dispatch({ type: "tasteUndo" });
    h.dispatch({ type: "tasteDone" });
    h.dispatch({ type: "meetDone" });
    expect(h.state).toEqual(initialMakerState);
    expect(h.setTaste).not.toHaveBeenCalled();
  });
});
