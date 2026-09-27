import { beforeEach, describe, expect, it } from "vitest";
import { useRoster } from "@/lib/people/roster";
import { runtimeProfilesFor, toRuntimeProfile } from "@/lib/people/runtimeProfile";
import type { FamilyProfile, TasteSummaryForAgents } from "@/types/domain";

const person: FamilyProfile = {
  id: "p-1",
  name: "Sam",
  relationship: "friend",
  look: "custom",
  colors: ["#e0312b", "#f7d63a"],
  personality: ["curious"],
  loves: ["puzzles"],
  avoids: ["glitter"],
  houseRules: [{ type: "excludedTag", tag: "glass", why: "Toddler in the house" }],
};

const taste: TasteSummaryForAgents = {
  summary: "casual, colorful",
  likes: ["casual", "colorful"],
  dislikes: ["formal"],
  confidence: 0.6,
  traits: { casual: { score: 0.8, confidence: 0.7 } },
  evidenceCount: 6,
};

beforeEach(() => {
  useRoster.getState().resetToStarters();
});

describe("toRuntimeProfile", () => {
  it("copies the roster profile and keeps hard rules exactly as declared", () => {
    const profile = toRuntimeProfile(person);
    expect(profile).toEqual(person);
    expect(profile.houseRules).not.toBe(person.houseRules);
    expect(profile.taste).toBeUndefined();
  });

  it("attaches taste only when there is evidence behind it", () => {
    expect(toRuntimeProfile(person, { taste }).taste).toEqual(taste);
    expect(toRuntimeProfile(person, { taste: { ...taste, evidenceCount: 0 } }).taste).toBeUndefined();
  });

  it("never turns a taste dislike into a house rule", () => {
    const profile = toRuntimeProfile(person, { taste });
    expect(profile.houseRules).toEqual(person.houseRules);
    expect(profile.avoids).toEqual(person.avoids);
  });
});

describe("runtimeProfilesFor", () => {
  it("returns roster people in the requested order and skips unknown ids", () => {
    const profiles = runtimeProfilesFor(["son", "ghost", "wife"]);
    expect(profiles.map((profile) => profile.id)).toEqual(["son", "wife"]);
  });

  it("asks for extras per person", () => {
    const profiles = runtimeProfilesFor(["daughter"], (id) => (id === "daughter" ? { taste } : {}));
    expect(profiles[0]!.taste?.summary).toBe("casual, colorful");
  });
});
