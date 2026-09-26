import transcript from "@/data/cached-transcript.json";
import type { CouncilEvent } from "@/types/domain";

export function getDemoTranscript(): CouncilEvent[] {
  return structuredClone(transcript) as CouncilEvent[];
}
