import type { Bundle, FamilyProfile, SpriteScore } from "@/types/domain";

export async function spriteScore(profile: FamilyProfile, bundle: Bundle): Promise<SpriteScore> {
  const matchingItems = bundle.items.filter((item) => item.tags.some((tag) => profile.loves.some((love) => love.includes(tag))));
  const score = Math.min(10, 5 + matchingItems.length * 2);
  return { spriteId: profile.id, score, say: `${profile.name} gives this bundle ${score} out of 10.` };
}
