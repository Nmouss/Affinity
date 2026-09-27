import { describe, expect, it } from "vitest";
import { DEFAULT_ICON, MAX_ICONS, MIN_ICONS, iconsForLove, iconsForProfile } from "@/components/sprites/icons";

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
  it("derives bauble, star, bulb and snowflake from gold/sparkle/lights/minimal loves", () => {
    const kinds = iconsForProfile({ loves: ["white and gold decor", "warm lights", "minimal design"] }).map(
      (icon) => icon.kind,
    );
    expect(kinds).toEqual(["bauble", "star", "bulb", "snowflake"]);
  });

  it("derives doll, bow and star from doll/pink/sparkle loves", () => {
    const kinds = iconsForProfile({ loves: ["dolls", "pink", "sparkle"] }).map((icon) => icon.kind);
    expect(kinds).toEqual(["doll", "bow", "star"]);
  });

  it("derives dinosaurs and a color-changing bulb from dino/lights loves", () => {
    const icons = iconsForProfile({ loves: ["dinosaurs", "color-changing lights", "giant inflatable T-rex"] });
    expect(icons.map((icon) => icon.kind)).toEqual(["dino", "bulb", "dino"]);
    expect(icons.find((icon) => icon.kind === "bulb")?.rainbow).toBe(true);
  });

  it("keeps warm lights warm (not rainbow)", () => {
    const icons = iconsForProfile({ loves: ["white and gold decor", "warm lights", "minimal design"] });
    expect(icons.find((icon) => icon.kind === "bulb")?.rainbow).toBe(false);
  });

  it("always returns 3–4 icons", () => {
    for (const loves of [[], ["jazz"], ["a", "b", "c", "d", "e", "f"], ["dinosaurs"]]) {
      const count = iconsForProfile({ loves }).length;
      expect(count).toBeGreaterThanOrEqual(MIN_ICONS);
      expect(count).toBeLessThanOrEqual(MAX_ICONS);
    }
  });
});
