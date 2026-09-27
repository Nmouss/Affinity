import { describe, expect, it } from "vitest";
import type { CharacterLook } from "@/types/character";
import {
  resolveDinnerPlanAction,
  resolvePlazaDrop,
  type PersonLookup,
} from "@/components/maker/plaza/PlazaRails";

// resolvePlazaDrop is the pure heart of PlazaRails' drop handling: given what the plaza scene
// reports (someone dropped on the edit/remove/move icon) it decides what should happen, without
// touching React, zustand, or the roster — those are just a PersonLookup here.

const LOOK: CharacterLook = {
  body: { height: 1, build: 0.5 },
  bodyColor: "#000000",
  accent: "#ffffff",
  skin: "#ffedce",
  eyes: { type: "oval", color: "#302c2b", size: 0, spacing: 0, height: 0 },
  brows: { type: "none", height: 0 },
  mouth: { type: "smile" },
  cheeks: { on: true, color: "#eab7a1" },
  accessory: { type: "none", color: "#000000" },
};

function lookupFor(id: string, overrides: Partial<{ name: string; relationship: string; look: CharacterLook; circle: "family" | "friend" }> = {}): PersonLookup {
  const known = {
    id,
    name: overrides.name ?? "Ava",
    relationship: overrides.relationship ?? "daughter",
    look: overrides.look ?? LOOK,
    circle: overrides.circle ?? "family",
  } as const;
  return {
    getPerson: (lookupId) => (lookupId === known.id ? { name: known.name, relationship: known.relationship } : undefined),
    getLook: (lookupId) => (lookupId === known.id ? known.look : undefined),
    getCircle: (lookupId) => (lookupId === known.id ? known.circle : undefined),
  };
}

describe("resolvePlazaDrop", () => {
  it("edit resolves to an editPerson dispatch built from the roster", () => {
    const result = resolvePlazaDrop("edit", "ava-id", lookupFor("ava-id", { name: "Ava", relationship: "daughter", circle: "family" }));
    expect(result).toEqual({
      kind: "editPerson",
      id: "ava-id",
      name: "Ava",
      circle: "family",
      relationship: "daughter",
      look: LOOK,
    });
  });

  it("edit resolves to null when the person can't be found (e.g. removed mid-drag)", () => {
    const result = resolvePlazaDrop("edit", "ghost-id", lookupFor("ava-id"));
    expect(result).toBeNull();
  });

  it("remove always resolves to a requestRemove, regardless of lookups", () => {
    const result = resolvePlazaDrop("remove", "ava-id", lookupFor("someone-else"));
    expect(result).toEqual({ kind: "requestRemove", id: "ava-id" });
  });

  it("move flips family to friend", () => {
    const result = resolvePlazaDrop("move", "ava-id", lookupFor("ava-id", { circle: "family" }));
    expect(result).toEqual({ kind: "move", id: "ava-id", from: "family", to: "friend" });
  });

  it("move flips friend to family", () => {
    const result = resolvePlazaDrop("move", "sam-id", lookupFor("sam-id", { circle: "friend" }));
    expect(result).toEqual({ kind: "move", id: "sam-id", from: "friend", to: "family" });
  });

  it("move resolves to null when the person isn't in any circle", () => {
    const result = resolvePlazaDrop("move", "ghost-id", lookupFor("ava-id"));
    expect(result).toBeNull();
  });
});

describe("resolveDinnerPlanAction", () => {
  it("opens participant selection before trying to launch", () => {
    expect(resolveDinnerPlanAction(false, ["ava"], [])).toEqual({ kind: "open" });
  });

  it("asks for people when the open mission circle is empty", () => {
    expect(resolveDinnerPlanAction(true, ["ava"], [])).toEqual({ kind: "needsPeople" });
  });

  it("launches with known mission-circle members only", () => {
    expect(resolveDinnerPlanAction(true, ["ava", "sam"], ["ghost", "sam"])).toEqual({
      kind: "launch",
      invitedIds: ["sam"],
    });
  });

  it("keeps the add-person hint when the roster is empty", () => {
    expect(resolveDinnerPlanAction(false, [], [])).toEqual({ kind: "emptyRoster" });
  });
});

describe("resolvePlazaDrop: interview", () => {
  it("carries the person's current preferences into the interview", () => {
    const lookup = lookupFor("wife", { name: "Maya" });
    const withPrefs: PersonLookup = {
      ...lookup,
      getPerson: (id) => (id === "wife" ? { name: "Maya", relationship: "grown-up", loves: ["gym"], avoids: ["clutter"], personality: ["practical"] } : undefined),
    };
    expect(resolvePlazaDrop("interview", "wife", withPrefs)).toMatchObject({
      kind: "interviewPerson",
      id: "wife",
      name: "Maya",
      preferences: { loves: ["gym"], avoids: ["clutter"], personality: ["practical"] },
    });
  });

  it("defaults missing preference lists to empty and needs a known look", () => {
    const lookup = lookupFor("wife");
    expect(resolvePlazaDrop("interview", "wife", lookup)).toMatchObject({ preferences: { loves: [], avoids: [], personality: [] } });
    expect(resolvePlazaDrop("interview", "ghost", lookup)).toBeNull();
  });
});
