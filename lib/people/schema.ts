import { z } from "zod";
import { TASTE_TRAITS } from "@/lib/taste/traits";
import type { TasteProfile, TasteTrait, TraitPreference } from "@/lib/taste/types";
import { ACCESSORY_TYPES, BROW_TYPES, CIRCLES, EYE_TYPES, MOUTH_TYPES } from "@/types/character";

// Validates what comes back out of localStorage before it ever reaches the roster store. Mirrors
// the frozen shapes in types/character.ts and types/domain.ts without importing them as runtime
// values (they're type-only exports there); any mismatch (a hand-edited key, an old app version,
// plain garbage) fails the whole parse so the caller can fall back to the starter roster.
//
// Taste is the one exception: it arrived later (v2) as a sibling `tasteProfiles` map, and a broken
// or missing taste entry must never cost anyone their people, looks, or circles. Taste is parsed
// per person and dropped on its own when invalid.

const houseRuleSchema = z.object({
  type: z.enum(["maxHeight", "excludedTag"]),
  inches: z.number().optional(),
  tag: z.string().optional(),
  why: z.string(),
});

const familyProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  relationship: z.string(),
  look: z.string(),
  colors: z.array(z.string()),
  personality: z.array(z.string()),
  loves: z.array(z.string()),
  avoids: z.array(z.string()),
  houseRules: z.array(houseRuleSchema),
});

const characterLookSchema = z.object({
  body: z.object({ height: z.number(), build: z.number() }),
  bodyColor: z.string(),
  accent: z.string(),
  skin: z.string(),
  eyes: z.object({
    type: z.enum(EYE_TYPES),
    color: z.string(),
    size: z.number(),
    spacing: z.number(),
    height: z.number(),
  }),
  brows: z.object({ type: z.enum(BROW_TYPES), height: z.number() }),
  mouth: z.object({ type: z.enum(MOUTH_TYPES) }),
  cheeks: z.object({ on: z.boolean(), color: z.string() }),
  accessory: z.object({ type: z.enum(ACCESSORY_TYPES), color: z.string() }),
});

/** The v1 roster: what every saved blob has carried since the People Maker shipped. */
export const persistedRosterSchema = z.object({
  people: z.array(familyProfileSchema),
  looks: z.record(z.string(), characterLookSchema),
  circles: z.record(z.string(), z.enum(CIRCLES)),
});

const tasteEvidenceSchema = z.object({
  comparisonId: z.string(),
  selectedItemId: z.string(),
  rejectedItemId: z.string(),
  delta: z.number(),
  recordedAt: z.string(),
});

const traitPreferenceSchema = z.object({
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(tasteEvidenceSchema),
});

export const tasteProfileSchema = z.object({
  version: z.literal(1),
  traits: z.record(z.string(), traitPreferenceSchema),
  completedComparisonIds: z.array(z.string()),
  summary: z.string().optional(),
  updatedAt: z.string(),
});

const KNOWN_TRAITS: ReadonlySet<string> = new Set(TASTE_TRAITS);

/** One person's taste, or null when the entry is not a valid profile. Unknown trait keys are dropped. */
export function parseTasteProfile(value: unknown): TasteProfile | null {
  const result = tasteProfileSchema.safeParse(value);
  if (!result.success) return null;
  const traits: Partial<Record<TasteTrait, TraitPreference>> = {};
  for (const [trait, preference] of Object.entries(result.data.traits)) {
    if (KNOWN_TRAITS.has(trait)) traits[trait as TasteTrait] = preference;
  }
  return { ...result.data, traits };
}

/** Taste profiles keyed by person id, keeping only valid entries for people who still exist. */
export function parseTasteProfiles(value: unknown, knownIds: ReadonlySet<string>): Record<string, TasteProfile> {
  const profiles: Record<string, TasteProfile> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return profiles;
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!knownIds.has(id)) continue;
    const profile = parseTasteProfile(entry);
    if (profile) profiles[id] = profile;
  }
  return profiles;
}

export interface PersistedRoster extends z.infer<typeof persistedRosterSchema> {
  tasteProfiles: Record<string, TasteProfile>;
}

/**
 * Parses and validates a persisted roster blob (v1 without taste, or v2 with it); null on anything
 * invalid or corrupt in the people/looks/circles core. Missing or broken taste never fails the parse.
 */
export function parsePersistedRoster(value: unknown): PersistedRoster | null {
  const core = persistedRosterSchema.safeParse(value);
  if (!core.success) return null;
  const knownIds = new Set(core.data.people.map((profile) => profile.id));
  const raw = (value as { tasteProfiles?: unknown }).tasteProfiles;
  return { ...core.data, tasteProfiles: parseTasteProfiles(raw, knownIds) };
}
