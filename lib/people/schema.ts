import { z } from "zod";
import { ACCESSORY_TYPES, BROW_TYPES, CIRCLES, EYE_TYPES, MOUTH_TYPES } from "@/types/character";

// Validates what comes back out of localStorage before it ever reaches the roster store. Mirrors
// the frozen shapes in types/character.ts and types/domain.ts without importing them as runtime
// values (they're type-only exports there); any mismatch (a hand-edited key, an old app version,
// plain garbage) fails the whole parse so the caller can fall back to the starter roster.

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

export const persistedRosterSchema = z.object({
  people: z.array(familyProfileSchema),
  looks: z.record(z.string(), characterLookSchema),
  circles: z.record(z.string(), z.enum(CIRCLES)),
});

export type PersistedRoster = z.infer<typeof persistedRosterSchema>;

/** Parses and validates a persisted roster blob; null on anything invalid or corrupt. */
export function parsePersistedRoster(value: unknown): PersistedRoster | null {
  const result = persistedRosterSchema.safeParse(value);
  return result.success ? result.data : null;
}
