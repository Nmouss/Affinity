import { parsedMissionSchema } from "@/shared/contracts";
import type { MissionType, ParsedMission } from "@/shared/types";

export type StructuredMissionExtractor = (text: string) => Promise<unknown>;

export const missionTemplates: Record<MissionType, { categories: string[] }> = {
  group_trip_supplies: { categories: ["cooking", "safety", "comfort", "entertainment"] },
  holiday_hosting: { categories: ["serving", "decor", "comfort", "cleanup"] },
  shared_home: { categories: ["kitchen", "storage", "comfort", "maintenance"] },
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function missionTypeFrom(text: string): MissionType | undefined {
  if (/\b(cabin|trip|travel|camp(?:ing)?)\b/i.test(text)) return "group_trip_supplies";
  if (/\b(holiday|host(?:ing)?|party|thanksgiving|christmas)\b/i.test(text)) return "holiday_hosting";
  if (/\b(shared home|roommate|apartment|household)\b/i.test(text)) return "shared_home";
  return undefined;
}

function durationFrom(text: string): number | undefined {
  const digit = text.match(/\b(\d+)\s*[- ]?day\b/i);
  if (digit) return Number(digit[1]);
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*[- ]?day\b/i);
  return word ? NUMBER_WORDS[word[1]!.toLowerCase()] : undefined;
}

function budgetFrom(text: string): number | undefined {
  const dollars = text.match(/(?:\$|under\s+|budget(?:\s+of)?\s+)(\d+(?:\.\d{1,2})?)/i);
  return dollars ? Number(dollars[1]) : undefined;
}

function destinationFrom(text: string): string | undefined {
  const named = text.match(/\b(Blue Ridge|Smoky Mountains?|Catskills?|Adirondacks?|Poconos?)\b/i);
  if (named) return named[1]!.replace(/\b\w/g, (character) => character.toUpperCase());
  const general = text.match(/\b(?:to|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:cabin|trip|weekend)\b/);
  return general?.[1];
}

function participantNamesFrom(text: string, speakerName: string): string[] {
  const names: string[] = [];
  if (/\b(?:for\s+)?me\b/i.test(text)) names.push(speakerName);
  const segment = text.match(/\bfor\s+(.+?)(?:\.|\bkeep\b|\bwith\b|$)/i)?.[1] ?? "";
  for (const match of segment.matchAll(/\b[A-Z][a-z]+\b/g)) {
    const name = match[0];
    if (!/^(Plan|For|One|Guest)$/i.test(name) && !names.includes(name)) names.push(name);
  }
  if (/\b(?:one\s+)?guest\b/i.test(text) && !names.includes("Guest")) names.push("Guest");
  return names;
}

function fallbackTitle(type: MissionType | undefined, destination: string | undefined): string {
  if (type === "group_trip_supplies" && destination) return `${destination} Cabin Weekend`;
  if (type === "group_trip_supplies") return "Group Trip Supplies";
  if (type === "holiday_hosting") return "Holiday Hosting";
  if (type === "shared_home") return "Shared Home";
  return "Shared Shopping Mission";
}

function finalize(parsed: ParsedMission): ParsedMission {
  const missionType = parsed.missionType;
  const categories = missionType ? missionTemplates[missionType].categories : parsed.categories;
  if (!missionType) {
    return {
      ...parsed,
      categories,
      needsConfirmation: true,
      clarificationQuestion: "Is this for group trip supplies, holiday hosting, or a shared home?",
    };
  }
  if (parsed.sharedBudget === undefined) {
    return {
      ...parsed,
      categories,
      needsConfirmation: true,
      clarificationQuestion: "What shared budget should I use?",
    };
  }
  return { ...parsed, categories, needsConfirmation: false, clarificationQuestion: undefined };
}

export function parseMissionFallback(text: string, speakerName = "Jonathan"): ParsedMission {
  const missionType = missionTypeFrom(text);
  const destination = destinationFrom(text);
  const parsed: ParsedMission = {
    missionType,
    title: fallbackTitle(missionType, destination),
    destination,
    durationDays: durationFrom(text),
    participantNames: participantNamesFrom(text, speakerName),
    sharedBudget: budgetFrom(text),
    categories: missionType ? missionTemplates[missionType].categories : [],
    needsConfirmation: false,
  };
  return finalize(parsedMissionSchema.parse(parsed));
}

export async function parseMission(
  text: string,
  extractor?: StructuredMissionExtractor,
  speakerName = "Jonathan",
): Promise<ParsedMission> {
  if (extractor) {
    try {
      const extracted = parsedMissionSchema.safeParse(await extractor(text));
      if (extracted.success) return finalize(extracted.data);
    } catch {
      // Network/provider failures deliberately fall through to the deterministic parser.
    }
  }
  return parseMissionFallback(text, speakerName);
}
