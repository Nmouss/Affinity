import { beforeEach, describe, expect, it } from "vitest";
import { getDemoTranscript } from "@/lib/demo/transcript";
import { STAGE_TRANSCRIPT } from "@/lib/demo/stageTranscript";
import { nextPhase } from "@/lib/director/phase";
import { useStage } from "@/lib/stage/store";

const state = () => useStage.getState();

beforeEach(() => {
  state().resetCouncil();
});

describe("phase walk over the stage transcript", () => {
  it("steps lobby → convening → … → awaitMandate → signing → receipt → lobby", () => {
    for (const id of ["wife", "daughter", "son"]) state().seatSprite(id, ["wife", "daughter", "son"].indexOf(id));
    state().advancePhase("convene");
    expect(state().phase).toBe("convening");

    const phases = STAGE_TRANSCRIPT.map((event) => {
      state().applyCouncilEvent(event);
      return state().phase;
    });
    expect(phases).toEqual([
      "opinions",
      "opinions",
      "opinions",
      "merge",
      "conflict",
      "bundle",
      "scoring",
      "scoring",
      "scoring",
      "awaitMandate",
    ]);

    state().advancePhase("handshakeComplete");
    expect(state().phase).toBe("signing");
    state().applyCouncilEvent({ type: "receipt", payload: { status: "approved", threadId: "receipt-1" } });
    expect(state().phase).toBe("receipt");
    expect(state().receipt?.threadId).toBe("receipt-1");
    expect(Object.values(state().sprites).every((sprite) => sprite.mood === "celebrating")).toBe(true);

    state().advancePhase("reset");
    expect(state().phase).toBe("lobby");
  });

  it("maps events to moods and fills the veto attribution", () => {
    const [wife, daughter, son, constraints, veto, bundle, ...scores] = STAGE_TRANSCRIPT;
    state().applyCouncilEvent(wife!);
    expect(state().sprites.wife).toMatchObject({ mood: "speaking", bubble: expect.stringContaining("under $25") });
    state().applyCouncilEvent(daughter!);
    expect(state().sprites.wife).toMatchObject({ mood: "listening", bubble: null });
    expect(state().sprites.daughter).toMatchObject({ mood: "speaking", bubble: expect.any(String) });
    state().applyCouncilEvent(son!);
    expect(state().sprites.daughter!.bubble).toBeNull();
    expect(state().sprites.son!.mood).toBe("speaking");
    state().applyCouncilEvent(constraints!);
    expect(state().sprites.son!.mood).toBe("listening");

    state().applyCouncilEvent(veto!);
    expect(state().conflict).toEqual({
      wishBy: "son",
      ruleBy: "wife",
      itemId: "oversized-lamp",
      resolvedItemId: "gift-lamp",
    });
    expect(state().sprites.wife!.mood).toBe("vetoing");
    expect(state().sprites.son!.mood).toBe("conceding");

    state().applyCouncilEvent(bundle!);
    expect(state().bundleShownAt).not.toBeNull();
    expect(state().sprites.daughter!.mood).toBe("scoring");

    for (const score of scores.filter((event) => event.type === "score")) state().applyCouncilEvent(score);
    expect(state().sprites.wife).toMatchObject({ mood: "happy", score: 9 });
    expect(state().sprites.son).toMatchObject({ mood: "happy", score: 7 });
    expect(state().sprites.son!.bubble).toBeTruthy();
    state().applyCouncilEvent({ type: "awaiting_mandate", payload: { items: [], total: 0, serves: {} } });
    expect(Object.values(state().sprites).every((sprite) => sprite.bubble === null)).toBe(true);
  });

  it("still drives the lab stepper's cached transcript from the lobby", () => {
    for (const event of getDemoTranscript()) state().applyCouncilEvent(event);
    expect(state().phase).toBe("bundle");
    expect(state().conflict?.wishBy).toBe("son");
    expect(state().bundle?.total).toBe(85);
  });
});

describe("nextPhase", () => {
  it("returns to bundle on a revise loop", () => {
    expect(nextPhase("scoring", "bundle", true)).toBe("bundle");
  });

  it("synthesizes awaitMandate when the stream ends after a bundle", () => {
    expect(nextPhase("bundle", "streamEnd", true)).toBe("awaitMandate");
    expect(nextPhase("scoring", "streamEnd", true)).toBe("awaitMandate");
    expect(nextPhase("opinions", "streamEnd", false)).toBe("opinions");
  });

  it("resets from anywhere and ignores out-of-phase inputs", () => {
    expect(nextPhase("signing", "reset")).toBe("lobby");
    expect(nextPhase("opinions", "convene")).toBe("opinions");
    expect(nextPhase("bundle", "handshakeComplete")).toBe("bundle");
    expect(nextPhase("signing", "score")).toBe("signing");
    expect(nextPhase("signing", "mandateRejected")).toBe("awaitMandate");
  });

  it("treats run_state as a no-op transition in any phase", () => {
    expect(nextPhase("awaitMandate", "run_state")).toBe("awaitMandate");
    expect(nextPhase("opinions", "run_state")).toBe("opinions");
    expect(nextPhase("signing", "run_state")).toBe("signing");
  });

  it("returns to the bundle phase when a swap arrives after awaitMandate", () => {
    expect(nextPhase("awaitMandate", "bundle", true)).toBe("bundle");
  });

  it("locks late bundle events out once signing or receipt has started", () => {
    expect(nextPhase("signing", "bundle", true)).toBe("signing");
    expect(nextPhase("receipt", "bundle", true)).toBe("receipt");
  });
});
