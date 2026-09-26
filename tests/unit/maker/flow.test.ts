import { describe, expect, it, vi } from "vitest";
import { BODY_PRESETS } from "@/types/character";
import { STARTER_LOOKS } from "@/lib/people/starters";
import type { NewPerson, PersonPatch } from "@/lib/people/roster";
import { flowReducer, initialMakerState, type FlowDeps, type MakerState } from "@/components/maker/flow";

function harness() {
  const addPerson = vi.fn<(person: NewPerson) => string | null>(() => "new-id");
  const updatePerson = vi.fn<(id: string, patch: PersonPatch) => void>();
  const deps: FlowDeps = { addPerson, updatePerson };
  let state: MakerState = initialMakerState;
  return {
    addPerson,
    updatePerson,
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
    expect(h.state.step).toBe("plaza");
    expect(h.state.draft).toBeNull();
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
});
