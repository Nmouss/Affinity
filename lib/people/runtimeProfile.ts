import type { FamilyProfile, RuntimeProfile, TasteSummaryForAgents } from "@/types/domain";
import { getPerson } from "./roster";

// The one mapper from a roster person (plus, later, their learned taste) to the profile the Python
// backend reasons from. Hard rules pass through untouched: taste can add preferences, never vetoes.

export interface RuntimeProfileExtras {
  taste?: TasteSummaryForAgents;
  email?: string;
}

export function toRuntimeProfile(person: FamilyProfile, extras: RuntimeProfileExtras = {}): RuntimeProfile {
  const profile: RuntimeProfile = {
    id: person.id,
    name: person.name,
    relationship: person.relationship,
    look: person.look,
    colors: [...person.colors],
    personality: [...person.personality],
    loves: [...person.loves],
    avoids: [...person.avoids],
    houseRules: person.houseRules.map((rule) => ({ ...rule })),
  };
  if (extras.email) profile.email = extras.email;
  if (extras.taste && extras.taste.evidenceCount > 0) profile.taste = extras.taste;
  return profile;
}

/** Runtime profiles for the invited ids, in the given order, skipping anyone the roster no longer knows. */
export function runtimeProfilesFor(
  ids: string[],
  extrasFor: (id: string) => RuntimeProfileExtras = () => ({}),
): RuntimeProfile[] {
  const profiles: RuntimeProfile[] = [];
  for (const id of ids) {
    const person = getPerson(id);
    if (person) profiles.push(toRuntimeProfile(person, extrasFor(id)));
  }
  return profiles;
}
