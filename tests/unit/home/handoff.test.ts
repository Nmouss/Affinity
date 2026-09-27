import { describe, expect, it } from "vitest";
import { buildGiftMission } from "@/lib/director/mission";
import { parsePendingMission, peekPendingMission, PENDING_MISSION_KEY, storePendingMission, takePendingMission } from "@/lib/stage/handoff";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    map,
  };
}

const mission = buildGiftMission({ recipientId: "daughter", advisorIds: ["wife"], budget: 60, slotQuery: "a cozy scarf" });

describe("pending mission handoff", () => {
  it("round-trips a gift mission and clears it on take", () => {
    const storage = memoryStorage();
    storePendingMission(mission, storage);
    expect(peekPendingMission(storage)).toEqual(mission);
    expect(takePendingMission(storage)).toEqual(mission);
    expect(storage.map.has(PENDING_MISSION_KEY)).toBe(false);
    expect(takePendingMission(storage)).toBeNull();
  });

  it("rejects garbage, wrong shapes, and gift missions whose recipient is not invited", () => {
    const storage = memoryStorage();
    storage.setItem(PENDING_MISSION_KEY, "{not json");
    expect(takePendingMission(storage)).toBeNull();
    storage.setItem(PENDING_MISSION_KEY, JSON.stringify({ occasion: "x" }));
    expect(takePendingMission(storage)).toBeNull();
    expect(parsePendingMission({ ...mission, budget: -1 })).toBeNull();
    expect(parsePendingMission({ ...mission, recipientId: "ghost" })).toBeNull();
    expect(parsePendingMission({ ...mission, invitedSpriteIds: [] })).toBeNull();
    expect(parsePendingMission(mission)).toEqual(mission);
  });

  it("is a no-op without storage", () => {
    storePendingMission(mission, null);
    expect(peekPendingMission(null)).toBeNull();
    expect(takePendingMission(null)).toBeNull();
  });
});
