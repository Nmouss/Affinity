import type { Circle } from "@/types/character";
import type { FamilyProfile } from "@/types/domain";
import type { WhistleSort } from "./plazaState";

// Plaza geometry and the whistle's line-ups. Pure, unit-tested. Stubs until the plaza scene track lands.

/** The plaza floor is a disc of this radius (ft) centered on the origin; the camera looks at it from +z. */
export const PLAZA = { radius: 7 } as const;

/** People ids in the order the whistle lines them up. Stub: roster order. */
export function sortForWhistle(people: FamilyProfile[], _circles: Record<string, Circle>, _sort: WhistleSort): string[] {
  return people.map((profile) => profile.id);
}

/** Floor spot [x, z] for each id in a whistle formation, rows facing the camera. Stub: one row. */
export function formationSlots(
  orderedIds: string[],
  _circles: Record<string, Circle>,
  _sort: WhistleSort,
): Record<string, [number, number]> {
  const spacing = 1.4;
  const start = (-(orderedIds.length - 1) * spacing) / 2;
  return Object.fromEntries(orderedIds.map((id, index) => [id, [start + index * spacing, 0] as [number, number]]));
}
