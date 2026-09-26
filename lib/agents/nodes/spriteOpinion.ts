import type { FamilyProfile, Mission, SpriteOpinion } from "@/types/domain";

export async function spriteOpinion(profile: FamilyProfile, mission: Mission): Promise<SpriteOpinion> {
  // Replace with model.withStructuredOutput(spriteOpinionSchema).invoke(...).
  return {
    spriteId: profile.id,
    say: `${profile.name} is thinking about ${mission.occasion}.`,
    hardRules: profile.houseRules,
    wishes: profile.loves,
    vetoes: profile.avoids,
  };
}
