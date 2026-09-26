import { describe, expect, it } from "vitest";
import { parseMission } from "@/backend/core/mission";
import { interpretVoice } from "@/backend/core/voice";

describe("mission parsing", () => {
  it("returns the fixed Blue Ridge three-day, $400 sample", async () => {
    await expect(
      parseMission("Plan a three-day Blue Ridge cabin trip for me, Maya, Alex, and one guest. Keep shared supplies under $400."),
    ).resolves.toEqual({
      missionType: "group_trip_supplies",
      title: "Blue Ridge Cabin Weekend",
      destination: "Blue Ridge",
      durationDays: 3,
      participantNames: ["Jonathan", "Maya", "Alex", "Guest"],
      sharedBudget: 400,
      categories: ["cooking", "safety", "comfort", "entertainment"],
      needsConfirmation: false,
      clarificationQuestion: undefined,
    });
  });

  it("asks exactly one bounded clarification question when the budget is missing", async () => {
    const parsed = await parseMission("Plan a three-day cabin trip to Blue Ridge for me and one guest.");

    expect(parsed.needsConfirmation).toBe(true);
    expect(parsed.clarificationQuestion).toBe("What shared budget should I use?");
    expect(Object.keys(parsed).filter((key) => key === "clarificationQuestion")).toHaveLength(1);
  });

  it.each([
    ["invalid structured output", async () => ({ missionType: "spaceship" })],
    ["throwing extractor", async () => { throw new Error("provider unavailable"); }],
  ])("falls back deterministically for a %s", async (_caseName, extractor) => {
    const parsed = await parseMission(
      "Plan a three-day cabin trip to Blue Ridge for me and one guest with a $400 budget.",
      extractor,
    );
    expect(parsed.title).toBe("Blue Ridge Cabin Weekend");
    expect(parsed.destination).toBe("Blue Ridge");
    expect(parsed.durationDays).toBe(3);
    expect(parsed.sharedBudget).toBe(400);
  });
});

describe("typed voice intent interpretation", () => {
  it("extracts cheaper and no-glass filters without confirmation", async () => {
    await expect(interpretVoice("Show me a cheaper option without glass.")).resolves.toEqual({
      transcript: "Show me a cheaper option without glass.",
      intent: "filter_products",
      entities: { priceDirection: "lower", excludedMaterial: "glass" },
      requiresConfirmation: false,
    });
  });

  it.each(["approve", "override"])("requires confirmation for %s even when the extractor says otherwise", async (action) => {
    const intent = await interpretVoice(`${action} this action`, async (transcript) => ({
      transcript,
      intent: "approve_action",
      entities: { action },
      requiresConfirmation: false,
    }));
    expect(intent.requiresConfirmation).toBe(true);
  });

  it.each([
    ["budget", { sharedBudget: 250 }],
    ["people", { participantNames: ["Maya"] }],
    ["rule", { rule: "no glass" }],
  ])("requires confirmation when a create-mission intent changes %s", async (_change, entities) => {
    const intent = await interpretVoice("Update the mission", async (transcript) => ({
      transcript,
      intent: "create_mission",
      entities,
      requiresConfirmation: false,
    }));
    expect(intent.requiresConfirmation).toBe(true);
  });

  it("falls back when structured voice extraction is invalid", async () => {
    const transcript = "Show me a cheaper option without glass.";
    const intent = await interpretVoice(transcript, async () => ({ intent: "unknown", entities: {} }));
    expect(intent).toEqual({
      transcript,
      intent: "filter_products",
      entities: { priceDirection: "lower", excludedMaterial: "glass" },
      requiresConfirmation: false,
    });
  });
});
