import { describe, expect, it } from "vitest";
import family from "@/data/family.json";
import { DEFAULT_ICON, MAX_ICONS, MIN_ICONS, iconsForLove, iconsForProfile } from "@/components/sprites/icons";
import type { FamilyProfile } from "@/types/domain";

const profiles = family as FamilyProfile[];
const byId = (id: string) => profiles.find((profile) => profile.id === id)!;
const kinds = (id: string) => iconsForProfile(byId(id)).map((icon) => icon.kind);

describe("iconsForLove", () => {
  it.each([
    ["dinosaurs", ["dino"]],
    ["dolls", ["doll"]],
    ["sparkle", ["star"]],
    ["warm lights", ["bulb"]],
    ["color-changing lights", ["bulb"]],
    ["pink", ["bow"]],
    ["white and gold decor", ["bauble", "star"]],
    ["minimal design", ["snowflake"]],
    ["giant inflatable T-rex", ["dino"]],
  ])("maps %s", (love, expected) => {
    expect(iconsForLove(love)).toEqual(expected);
  });

  it("falls back to a default for loves it does not know", () => {
    expect(iconsForLove("jazz records")).toEqual([DEFAULT_ICON]);
  });
});

describe("iconsForProfile", () => {
  it("gives Maya bauble, star, bulb and snowflake", () => {
    expect(kinds("wife")).toEqual(["bauble", "star", "bulb", "snowflake"]);
  });

  it("gives Ava doll, bow and star", () => {
    expect(kinds("daughter")).toEqual(["doll", "bow", "star"]);
  });

  it("gives Leo dinosaurs and a color-changing bulb", () => {
    const icons = iconsForProfile(byId("son"));
    expect(icons.map((icon) => icon.kind)).toEqual(["dino", "bulb", "dino"]);
    expect(icons.find((icon) => icon.kind === "bulb")?.rainbow).toBe(true);
  });

  it("keeps Maya's warm lights warm", () => {
    expect(iconsForProfile(byId("wife")).find((icon) => icon.kind === "bulb")?.rainbow).toBe(false);
  });

  it("always returns 3–4 icons", () => {
    for (const loves of [[], ["jazz"], ["a", "b", "c", "d", "e", "f"], ["dinosaurs"]]) {
      const count = iconsForProfile({ loves }).length;
      expect(count).toBeGreaterThanOrEqual(MIN_ICONS);
      expect(count).toBeLessThanOrEqual(MAX_ICONS);
    }
  });
});
