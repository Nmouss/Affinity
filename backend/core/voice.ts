import { voiceIntentSchema } from "@/shared/contracts";
import type { VoiceIntent, VoiceIntentName } from "@/shared/types";

export type StructuredVoiceExtractor = (transcript: string) => Promise<unknown>;

function confirmationRequired(intent: VoiceIntentName, entities: VoiceIntent["entities"]): boolean {
  if (intent === "approve_action") return true;
  if (intent === "create_mission") {
    return ["sharedBudget", "participantNames", "rule", "rules"].some((key) => key in entities);
  }
  return false;
}

function withConfirmationPolicy(intent: VoiceIntent): VoiceIntent {
  return { ...intent, requiresConfirmation: confirmationRequired(intent.intent, intent.entities) };
}

export function interpretVoiceFallback(transcript: string): VoiceIntent {
  const lower = transcript.toLowerCase();
  let intent: VoiceIntentName = "filter_products";
  const entities: VoiceIntent["entities"] = {};

  if (/\b(approve|pay|purchase|override)\b/.test(lower)) {
    intent = "approve_action";
    entities.action = lower.match(/\b(override|pay|purchase|approve)\b/)?.[1] ?? "approve";
  } else if (/\b(why|explain|reason)\b/.test(lower)) {
    intent = "explain_decision";
  } else if (/\bcompare\b/.test(lower)) {
    intent = "compare_products";
  } else if (/\b(add|remove)\b/.test(lower)) {
    intent = "modify_cart";
    entities.action = lower.includes("remove") ? "remove" : "add";
  } else if (/\b(budget|invite|participant|person|people|rule)\b/.test(lower)) {
    intent = "create_mission";
    const budget = transcript.match(/(?:\$|budget(?:\s+to|\s+of)?\s+)(\d+(?:\.\d{1,2})?)/i);
    if (budget) entities.sharedBudget = Number(budget[1]);
    if (/\brule\b/i.test(transcript)) entities.rule = transcript;
    if (/\b(invite|participant|person|people)\b/i.test(transcript)) entities.participantNames = [];
  } else if (/\b(show|open|go to|category)\b/.test(lower) && !/\b(cheaper|without|under|filter)\b/.test(lower)) {
    intent = "navigate_category";
  }

  if (/\b(cheaper|lower price|less expensive)\b/.test(lower)) entities.priceDirection = "lower";
  const excludedMaterial = transcript.match(/\b(?:without|no|exclude)\s+(glass|plastic|wood|metal)\b/i);
  if (excludedMaterial) entities.excludedMaterial = excludedMaterial[1]!.toLowerCase();

  return withConfirmationPolicy(
    voiceIntentSchema.parse({ transcript, intent, entities, requiresConfirmation: false }),
  );
}

export async function interpretVoice(
  transcript: string,
  extractor?: StructuredVoiceExtractor,
): Promise<VoiceIntent> {
  if (extractor) {
    try {
      const extracted = voiceIntentSchema.safeParse(await extractor(transcript));
      if (extracted.success) return withConfirmationPolicy({ ...extracted.data, transcript });
    } catch {
      // Provider failures deliberately fall through to deterministic interpretation.
    }
  }
  return interpretVoiceFallback(transcript);
}
