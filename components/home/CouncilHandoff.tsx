"use client";

import { useEffect } from "react";
import { getPerson, useRoster, useRosterHydration } from "@/lib/people/roster";
import { emitGesture } from "@/lib/stage/bus";
import { peekPendingMission, takePendingMission } from "@/lib/stage/handoff";
import { MAX_SEATS } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";

// Mounted on /council next to the stage. When the Plaza home handed over a gift mission (in the
// stage store, or mirrored in sessionStorage after a reload), this seats the invited characters —
// recipient first, by the hearth — and convenes the council once. `?demo` leaves the lobby alone so
// the recorded tree replay keeps working exactly as before. Renders nothing.

const RETRY_MS = 60;
const MAX_TRIES = 50;

export function CouncilHandoff() {
  useRosterHydration();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("demo")) return;
    let cancelled = false;
    let tries = 0;

    const retry = () => {
      if (cancelled || tries >= MAX_TRIES) return;
      tries += 1;
      setTimeout(attempt, RETRY_MS);
    };

    const attempt = () => {
      if (cancelled) return;
      const stage = useStage.getState();
      if (stage.phase !== "lobby") return;
      const mission = stage.mission?.type === "gift" ? stage.mission : peekPendingMission();
      if (!mission || mission.type !== "gift" || !mission.recipientId) return;

      const known = mission.invitedSpriteIds.filter((id) => getPerson(id) !== undefined).slice(0, MAX_SEATS);
      // Custom people arrive with hydration; wait for it before deciding anyone is missing.
      if (known.length < mission.invitedSpriteIds.length && !useRoster.persist.hasHydrated()) return retry();
      if (!known.includes(mission.recipientId)) {
        takePendingMission();
        return;
      }
      const trimmed = known.length === mission.invitedSpriteIds.length ? mission : { ...mission, invitedSpriteIds: known };
      stage.setMission(trimmed);
      stage.setMissionText(trimmed.freeText);
      if (Object.values(stage.sprites).every((sprite) => sprite.seat === null)) {
        known.forEach((id, seat) => useStage.getState().seatSprite(id, seat));
      }
      takePendingMission();
      // The director (mounted by the HUD) arms convene once the mission text and a seat are in; if it
      // isn't listening yet, the phase stays in the lobby and we try again shortly.
      emitGesture({ type: "convene" });
      if (useStage.getState().phase === "lobby") retry();
    };

    // Never convene synchronously on mount: React's development double-invoke mounts, disposes, and
    // remounts the HUD's director in the same tick, and a convene handled by the disposed instance
    // has its stream aborted with the phase already out of the lobby. One tick later the director
    // that will live is the one listening.
    const first = setTimeout(attempt, RETRY_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
    };
  }, []);

  return null;
}
