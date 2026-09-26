import { beforeEach, describe, expect, it } from "vitest";
import cachedTranscript from "@/data/cached-transcript.json";
import { useRoster } from "@/lib/people/roster";
import { BLANK_LOOK } from "@/lib/people/starters";
import { useStage } from "@/lib/stage/store";
import type { CouncilEvent } from "@/types/domain";

const transcript = cachedTranscript as CouncilEvent[];

describe("council slice + the people roster", () => {
  beforeEach(() => {
    useRoster.getState().resetToStarters();
    useStage.getState().resetCouncil();
  });

  it("seating a friend adds them to visitors", () => {
    const friendId = useRoster.getState().addPerson({
      name: "Friend",
      circle: "friend",
      relationship: "friend",
      look: BLANK_LOOK,
    });
    expect(friendId).not.toBeNull();
    expect(useStage.getState().visitors).not.toContain(friendId);

    useStage.getState().seatSprite(friendId!, 0);
    expect(useStage.getState().visitors).toContain(friendId);
    expect(useStage.getState().sprites[friendId!]).toMatchObject({ seat: 0, mood: "seated" });
  });

  it("seating a family member never adds them to visitors", () => {
    useStage.getState().seatSprite("wife", 0);
    expect(useStage.getState().visitors).toEqual([]);
  });

  it("reset clears visitors", () => {
    const friendId = useRoster.getState().addPerson({
      name: "Friend",
      circle: "friend",
      relationship: "friend",
      look: BLANK_LOOK,
    });
    useStage.getState().seatSprite(friendId!, 0);
    expect(useStage.getState().visitors.length).toBeGreaterThan(0);

    useStage.getState().resetCouncil();
    expect(useStage.getState().visitors).toEqual([]);
  });

  it("keeps the roster's sprites in sync: new person gets a blank entry, removed person's is dropped", () => {
    const friendId = useRoster.getState().addPerson({
      name: "Friend",
      circle: "friend",
      relationship: "friend",
      look: BLANK_LOOK,
    });
    expect(useStage.getState().sprites[friendId!]).toEqual({ mood: "idle", seat: null, bubble: null, score: null });

    useRoster.getState().removePerson("son");
    expect(useStage.getState().sprites.son).toBeUndefined();
  });

  it("runs the whole stage transcript without throwing with an extra family member and a friend in the roster, skipping events for a removed starter", () => {
    useRoster.getState().addPerson({ name: "Cousin", circle: "family", relationship: "cousin", look: BLANK_LOOK });
    useRoster.getState().addPerson({ name: "Friend", circle: "friend", relationship: "friend", look: BLANK_LOOK });
    useRoster.getState().removePerson("son");

    expect(() => {
      for (const event of transcript) useStage.getState().applyCouncilEvent(event);
    }).not.toThrow();

    // Son's opinion/veto/score lines (the transcript is written for wife/daughter/son) are skipped
    // entirely: no ghost sprite, no ghost opinion or score for someone no longer in the roster.
    expect(useStage.getState().sprites.son).toBeUndefined();
    expect(useStage.getState().opinions.son).toBeUndefined();
    expect(useStage.getState().scores.son).toBeUndefined();
    // The still-present starters got their lines normally.
    expect(useStage.getState().opinions.wife).toBeDefined();
  });
});
