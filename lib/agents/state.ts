import type { Bundle, ConstraintSet, Mission, SpriteOpinion, SpriteScore } from "@/types/domain";

export interface CouncilState {
  mission: Mission;
  opinions: SpriteOpinion[];
  constraints?: ConstraintSet;
  bundle?: Bundle;
  scores: SpriteScore[];
  revisionCount: number;
}
