import family from "@/data/family.json";
import type { CharacterLook, Circle } from "@/types/character";
import type { FamilyProfile } from "@/types/domain";

// The demo family everyone starts with (and falls back to when saved data is unreadable).
// Their looks reproduce the characters from before the People Maker existed.

export const STARTER_PEOPLE = family as FamilyProfile[];

export const STARTER_LOOKS: Record<string, CharacterLook> = {
  wife: {
    body: { height: 1, build: 0.5 },
    bodyColor: "#eeda9e",
    accent: "#c9a227",
    skin: "#ffedce",
    eyes: { type: "oval", color: "#302c2b", size: 0, spacing: 0, height: 0 },
    brows: { type: "none", height: 0 },
    mouth: { type: "smile" },
    cheeks: { on: true, color: "#eab7a1" },
    accessory: { type: "scarf", color: "#c9a227" },
  },
  daughter: {
    body: { height: 0.6, build: 0.4 },
    bodyColor: "#ff99d4",
    accent: "#ffe5f5",
    skin: "#ffedce",
    eyes: { type: "oval", color: "#302c2b", size: 0, spacing: 0, height: 0 },
    brows: { type: "none", height: 0 },
    mouth: { type: "smile" },
    cheeks: { on: true, color: "#eab7a1" },
    accessory: { type: "bow", color: "#ffe5f5" },
  },
  son: {
    body: { height: 0.55, build: 0.7 },
    bodyColor: "#41c892",
    accent: "#2474ff",
    skin: "#ffedce",
    eyes: { type: "oval", color: "#302c2b", size: 0, spacing: 0, height: 0 },
    brows: { type: "none", height: 0 },
    mouth: { type: "smile" },
    cheeks: { on: true, color: "#eab7a1" },
    accessory: { type: "dinosaur", color: "#2474ff" },
  },
};

export const STARTER_CIRCLES: Record<string, Circle> = { wife: "family", daughter: "family", son: "family" };

/** A plain look for "Start from scratch". */
export const BLANK_LOOK: CharacterLook = {
  body: { height: 1, build: 0.5 },
  bodyColor: "#f7d63a",
  accent: "#f47a20",
  skin: "#ffedce",
  eyes: { type: "dot", color: "#302c2b", size: 0, spacing: 0, height: 0 },
  brows: { type: "none", height: 0 },
  mouth: { type: "smile" },
  cheeks: { on: true, color: "#eab7a1" },
  accessory: { type: "none", color: "#f47a20" },
};
