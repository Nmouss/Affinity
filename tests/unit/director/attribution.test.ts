import { describe, expect, it } from "vitest";
import cachedTranscript from "@/data/cached-transcript.json";
import { attributeVeto, ruleTypeOf } from "@/lib/director/attribution";
import { STAGE_TRANSCRIPT } from "@/lib/demo/stageTranscript";
import { getPeople } from "@/lib/people/roster";
import { CATALOG } from "@/lib/stage/slices/council";
import type { CouncilEvent, SpriteOpinion } from "@/types/domain";

// The starter roster's family (wife/daughter/son) is what the cached transcript and stage
// transcript were both written for.
const FAMILY = getPeople();
const events = cachedTranscript as CouncilEvent[];
const opinions: Record<string, SpriteOpinion> = Object.fromEntries(
  events.flatMap((event) => (event.type === "opinion" ? [[event.payload.spriteId, event.payload]] : [])),
);
const veto = events.find((event) => event.type === "veto")!.payload as { rule: string; wish: string; resolution: string };

describe("attributeVeto", () => {
  it("attributes the demo veto: Leo's T-rex, Maya's height rule, dinosaur ornaments", () => {
    expect(attributeVeto(veto, opinions, FAMILY, CATALOG)).toEqual({
      wishBy: "son",
      ruleBy: "wife",
      itemId: "inflatable-trex",
      resolvedItemId: "orn-dino",
    });
  });

  it("falls back to family profiles before any opinion arrives", () => {
    expect(attributeVeto(veto, {}, FAMILY, CATALOG)).toMatchObject({ wishBy: "son", ruleBy: "wife" });
  });

  it("agrees with the stage transcript's veto", () => {
    const stageVeto = STAGE_TRANSCRIPT.find((event) => event.type === "veto");
    expect(stageVeto?.type).toBe("veto");
    if (stageVeto?.type === "veto") {
      expect(attributeVeto(stageVeto.payload, opinions, FAMILY, CATALOG).wishBy).toBe("son");
    }
  });

  it("prefers explicit attribution fields when the agents send them", () => {
    const explicit = { ...veto, wishBy: "daughter", ruleBy: "son", itemId: "tree-6ft", resolvedItemId: "tree-4ft" };
    expect(attributeVeto(explicit, opinions, FAMILY, CATALOG)).toEqual({
      wishBy: "daughter",
      ruleBy: "son",
      itemId: "tree-6ft",
      resolvedItemId: "tree-4ft",
    });
  });

  it("names the rule type from free text", () => {
    expect(ruleTypeOf("Maximum height: 48 inches")).toBe("maxHeight");
    expect(ruleTypeOf("No glitter in the house")).toBe("excludedTag");
  });
});
