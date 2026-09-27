import { z } from "zod";
import type { Mission } from "@/types/domain";

// The gift mission travels from the Plaza home to /council in the stage store; this mirrors it in
// sessionStorage so a reload of /council can pick the same mission back up instead of dropping the
// user into an empty lobby. Validated on the way out like the roster is, so a stale or hand-edited
// blob is ignored rather than trusted.

export const PENDING_MISSION_KEY = "affinity.pendingMission.v1";

const missionSchema = z.object({
  occasion: z.string().min(1),
  budget: z.number().positive(),
  freeText: z.string(),
  type: z.enum(["shared", "gift"]),
  recipientId: z.string().min(1).optional(),
  invitedSpriteIds: z.array(z.string().min(1)).min(1),
  kind: z.enum(["shopping", "plan"]).optional(),
  shoppingSlots: z
    .array(z.object({ id: z.string().min(1), query: z.string().min(1), quantity: z.number().int().positive().optional() }))
    .optional(),
});

/** A gift mission must name a recipient who is also invited. */
export function parsePendingMission(value: unknown): Mission | null {
  const result = missionSchema.safeParse(value);
  if (!result.success) return null;
  const mission = result.data;
  if (mission.type === "gift" && (!mission.recipientId || !mission.invitedSpriteIds.includes(mission.recipientId))) return null;
  return mission;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function storePendingMission(mission: Mission, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(PENDING_MISSION_KEY, JSON.stringify(mission));
  } catch {
    // Storage blocked (private browsing, quota): the in-memory store still carries the mission.
  }
}

/** Reads the pending mission without clearing it. */
export function peekPendingMission(storage: StorageLike | null = defaultStorage()): Mission | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(PENDING_MISSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return parsePendingMission(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Reads and clears the pending mission; a bad blob is cleared too. */
export function takePendingMission(storage: StorageLike | null = defaultStorage()): Mission | null {
  const mission = peekPendingMission(storage);
  if (storage) {
    try {
      storage.removeItem(PENDING_MISSION_KEY);
    } catch {
      // ignore
    }
  }
  return mission;
}
