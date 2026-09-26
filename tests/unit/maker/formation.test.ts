import { describe, expect, it } from "vitest";
import { FORMATION, PLAZA, formationSlots, sortForWhistle } from "@/components/maker/plaza/formation";
import type { Circle } from "@/types/character";
import type { FamilyProfile } from "@/types/domain";

function person(id: string, name: string): FamilyProfile {
  return { id, name, relationship: "", look: "custom", colors: [], personality: [], loves: [], avoids: [], houseRules: [] };
}

const PEOPLE = [
  person("p-bea", "Bea"),
  person("p-anna", "anna"), // lowercase on purpose: sort must be case-insensitive
  person("p-cy", "Cy"),
  person("p-dee", "Dee"),
  person("p-eli", "Eli"),
  person("p-fox", "Fox"),
  person("p-gus", "Gus"),
];

const CIRCLES: Record<string, Circle> = {
  "p-bea": "family",
  "p-anna": "family",
  "p-cy": "family",
  "p-dee": "family",
  "p-eli": "friend",
  "p-fox": "friend",
  "p-gus": "friend",
};

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

describe("sortForWhistle", () => {
  it("'name' sorts everyone case-insensitively A-Z", () => {
    expect(sortForWhistle(PEOPLE, CIRCLES, "name")).toEqual([
      "p-anna",
      "p-bea",
      "p-cy",
      "p-dee",
      "p-eli",
      "p-fox",
      "p-gus",
    ]);
  });

  it("breaks ties by id", () => {
    const tied = [person("p-b", "Sam"), person("p-a", "sam")];
    expect(sortForWhistle(tied, {}, "name")).toEqual(["p-a", "p-b"]);
  });

  it("'circle' sorts family A-Z, then friends A-Z", () => {
    expect(sortForWhistle(PEOPLE, CIRCLES, "circle")).toEqual([
      "p-anna",
      "p-bea",
      "p-cy",
      "p-dee",
      "p-eli",
      "p-fox",
      "p-gus",
    ]);
  });

  it("keeps family and friends separate even when names interleave alphabetically", () => {
    const people = [person("p-zeb", "Zeb"), person("p-abe", "Abe")];
    const circles: Record<string, Circle> = { "p-zeb": "family", "p-abe": "friend" };
    // Abe (friend) sorts before Zeb (family) alphabetically, but circle order must keep family first.
    expect(sortForWhistle(people, circles, "circle")).toEqual(["p-zeb", "p-abe"]);
  });
});

describe("formationSlots", () => {
  it("'name' rows are centered on x = 0 and step back in -z as rows fill", () => {
    const order = sortForWhistle(PEOPLE, CIRCLES, "name");
    const slots = formationSlots(order, CIRCLES, "name");
    // 7 people, maxPerRow 6 -> row 0 has 6 (front, larger z), row 1 has 1 (behind, smaller z).
    const row0Ids = order.slice(0, 6);
    const row1Id = order[6]!;
    const row0Zs = row0Ids.map((id) => slots[id]![1]);
    for (const z of row0Zs) expect(z).toBeCloseTo(row0Zs[0]!);
    expect(slots[row1Id]![1]).toBeLessThan(row0Zs[0]!);
    const xs = row0Ids.map((id) => slots[id]![0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-((6 - 1) / 2) * FORMATION.colSpacing);
    expect(xs[5]).toBeCloseTo(((6 - 1) / 2) * FORMATION.colSpacing);
  });

  it("'circle' puts family on the left (x < 0) and friends on the right (x > 0)", () => {
    const order = sortForWhistle(PEOPLE, CIRCLES, "circle");
    const slots = formationSlots(order, CIRCLES, "circle");
    for (const id of Object.keys(CIRCLES)) {
      const [x] = slots[id]!;
      if (CIRCLES[id] === "family") expect(x).toBeLessThan(0);
      else expect(x).toBeGreaterThan(0);
    }
  });

  it("'circle' leaves at least the block gap between the two sides", () => {
    const order = sortForWhistle(PEOPLE, CIRCLES, "circle");
    const slots = formationSlots(order, CIRCLES, "circle");
    const familyMaxX = Math.max(...Object.keys(CIRCLES).filter((id) => CIRCLES[id] === "family").map((id) => slots[id]![0]));
    const friendMinX = Math.min(...Object.keys(CIRCLES).filter((id) => CIRCLES[id] !== "family").map((id) => slots[id]![0]));
    expect(friendMinX - familyMaxX).toBeGreaterThanOrEqual(FORMATION.blockGap - 1e-6);
  });

  it("never places two slots closer than 1.2 ft, in either formation", () => {
    for (const sort of ["name", "circle"] as const) {
      const order = sortForWhistle(PEOPLE, CIRCLES, sort);
      const slots = formationSlots(order, CIRCLES, sort);
      const positions = Object.values(slots);
      for (let i = 0; i < positions.length; i += 1) {
        for (let j = i + 1; j < positions.length; j += 1) {
          expect(distance(positions[i]!, positions[j]!)).toBeGreaterThanOrEqual(1.2);
        }
      }
    }
  });

  it("keeps every slot inside the plaza disc, in either formation", () => {
    for (const sort of ["name", "circle"] as const) {
      const order = sortForWhistle(PEOPLE, CIRCLES, sort);
      const slots = formationSlots(order, CIRCLES, sort);
      for (const [x, z] of Object.values(slots)) {
        expect(Math.hypot(x, z)).toBeLessThanOrEqual(PLAZA.radius);
      }
    }
  });

  it("returns one slot per id with no duplicates", () => {
    const order = sortForWhistle(PEOPLE, CIRCLES, "circle");
    const slots = formationSlots(order, CIRCLES, "circle");
    expect(Object.keys(slots).sort()).toEqual([...order].sort());
    const seen = new Set<string>();
    for (const [x, z] of Object.values(slots)) {
      const key = `${x.toFixed(3)},${z.toFixed(3)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
