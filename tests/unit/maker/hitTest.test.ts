import { describe, expect, it } from "vitest";
import { ndcToClient, uiTargetId, uiTargetValue } from "@/components/hands/makerHitTest";

describe("ndcToClient", () => {
  it("maps NDC center to the middle of the viewport", () => {
    expect(ndcToClient([0, 0], 1000, 800)).toEqual([500, 400]);
  });

  it("maps NDC corners to pixel corners, flipping y (NDC up, client down)", () => {
    expect(ndcToClient([-1, 1], 1000, 800)).toEqual([0, 0]);
    expect(ndcToClient([1, 1], 1000, 800)).toEqual([1000, 0]);
    expect(ndcToClient([-1, -1], 1000, 800)).toEqual([0, 800]);
    expect(ndcToClient([1, -1], 1000, 800)).toEqual([1000, 800]);
  });

  it("scales linearly with viewport size", () => {
    expect(ndcToClient([0.5, 0.5], 1280, 800)).toEqual([960, 200]);
  });
});

describe("uiTargetId / uiTargetValue", () => {
  it("wraps a data-hand-target value into a ui: TargetId", () => {
    expect(uiTargetId("plaza-new")).toBe("ui:plaza-new");
  });

  it("round-trips through uiTargetValue", () => {
    expect(uiTargetValue(uiTargetId("editor-save"))).toBe("editor-save");
  });

  it("returns null for a non-ui target and for null", () => {
    expect(uiTargetValue("sprite:wife")).toBeNull();
    expect(uiTargetValue(null)).toBeNull();
  });

  it("handles values that themselves contain colons (e.g. start:preset:daughter)", () => {
    const id = uiTargetId("start:preset:daughter");
    expect(id).toBe("ui:start:preset:daughter");
    expect(uiTargetValue(id)).toBe("start:preset:daughter");
  });
});
