import type { CouncilState } from "../state";

export async function intake(state: CouncilState): Promise<CouncilState> {
  if (state.mission.budget <= 0) throw new Error("Mission budget must be positive");
  if (state.mission.invitedSpriteIds.length === 0) throw new Error("Invite at least one sprite");
  return state;
}
