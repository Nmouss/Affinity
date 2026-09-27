import type { EnvironmentPreset } from "@/components/stage/room/environments";

const KEYWORDS: Record<Exclude<EnvironmentPreset, "neutral">, RegExp> = {
  winter: /christmas|holiday|winter|snow|hanukkah/i,
  plaza: /market|festival|outdoor|plaza|fair/i,
  mall: /mall|shopping cent(?:er|re)|store|retail/i,
  restaurant: /dinner|restaurant|reservation|anniversary/i,
  stadium: /\bgame\b|stadium|\bsport|concert|tailgate/i,
};

/** Picks a background preset from the mission's free text; falls back to neutral. */
export function classifyEnvironment(missionText: string): EnvironmentPreset {
  for (const [preset, pattern] of Object.entries(KEYWORDS)) {
    if (pattern.test(missionText)) return preset as EnvironmentPreset;
  }
  return "neutral";
}
