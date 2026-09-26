import type { CouncilState } from "./state";
import { intake } from "./nodes/intake";
import { mergeOpinions } from "./nodes/merge";
import { shop } from "./nodes/shop";

// Assemble the LangGraph fan-out/fan-in workflow here. Keeping graph composition
// separate from node logic makes deterministic demo playback easy to substitute.
export async function runCouncil(initialState: CouncilState): Promise<CouncilState> {
  const state = await intake(initialState);
  state.constraints = mergeOpinions(state.mission, state.opinions);
  state.bundle = shop(state.mission, state.constraints);
  return state;
}
