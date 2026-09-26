import type { ConstraintSet, Mission, SpriteOpinion } from "@/types/domain";

export function mergeOpinions(mission: Mission, opinions: SpriteOpinion[]): ConstraintSet {
  const heightRules = opinions.flatMap((opinion) => opinion.hardRules)
    .filter((rule) => rule.type === "maxHeight" && rule.inches !== undefined)
    .sort((a, b) => (a.inches ?? Infinity) - (b.inches ?? Infinity));
  const otherRules = opinions.flatMap((opinion) => opinion.hardRules)
    .filter((rule) => rule.type !== "maxHeight");

  return {
    hardRules: [...heightRules.slice(0, 1), ...otherRules],
    wishes: opinions.flatMap((opinion) => opinion.wishes.map((wish) => ({
      spriteId: opinion.spriteId,
      wish,
      weight: mission.type === "gift" && mission.recipientId === opinion.spriteId ? 2 : 1,
    }))),
    conflicts: [],
  };
}
