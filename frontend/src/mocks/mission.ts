import type { MissionDraft } from "../services/contracts";

export const CABIN_TRANSCRIPT =
  "Plan a three-day Blue Ridge cabin trip for me, Maya, Alex, and one guest. Keep shared supplies under $400.";

export const MISSION_EXAMPLES = [
  "Prepare for a weekend cabin trip",
  "Host a holiday dinner",
  "Furnish a shared apartment",
];

/** Fixed parse result for the cabin mission (Terminal 1 brief, Deliverable 1). */
export const cabinDraft: MissionDraft = {
  missionType: "group_trip_supplies",
  title: "Blue Ridge Cabin Weekend",
  destination: "Blue Ridge",
  durationDays: 3,
  participantNames: ["Jonathan", "Maya", "Alex", "Guest"],
  sharedBudget: 400,
  categories: ["cooking", "safety", "comfort", "entertainment"],
  needsConfirmation: false,
};

const holidayDraft: MissionDraft = {
  missionType: "holiday_hosting",
  title: "Holiday Dinner",
  participantNames: ["Jonathan", "Maya", "Alex", "Guest"],
  sharedBudget: 300,
  categories: ["cooking", "table", "decor", "entertainment"],
  needsConfirmation: false,
};

const apartmentDraft: MissionDraft = {
  missionType: "shared_home",
  title: "Shared Apartment",
  participantNames: ["Jonathan", "Maya", "Alex", "Guest"],
  sharedBudget: 800,
  categories: ["kitchen", "living room", "cleaning", "bathroom"],
  needsConfirmation: false,
};

/**
 * Mock stand-in for POST /missions/parse. It picks one fixed template by keyword; the real parser
 * belongs to Terminal 1. The cabin template is the default so the demo never dead-ends.
 */
export function mockParse(text: string): MissionDraft {
  const lower = text.toLowerCase();
  const base = lower.includes("holiday") || lower.includes("dinner")
    ? holidayDraft
    : lower.includes("apartment") || lower.includes("furnish")
      ? apartmentDraft
      : cabinDraft;
  const budget = /\$\s?(\d[\d,]*)/.exec(text);
  return {
    ...base,
    participantNames: [...base.participantNames],
    categories: [...base.categories],
    sharedBudget: budget ? Number(budget[1].replace(/,/g, "")) : base.sharedBudget,
  };
}
