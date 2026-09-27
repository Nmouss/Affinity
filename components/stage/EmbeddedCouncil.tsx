"use client";

import { useEffect } from "react";
import { Hud } from "@/components/hud/Hud";
import { emitGesture } from "@/lib/stage/bus";
import { getPeople } from "@/lib/people/roster";
import { MAX_SEATS } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import styles from "./EmbeddedCouncil.module.css";

export type MissionMode = "shopping" | "plan";

const DEFAULT_MISSIONS: Record<MissionMode, string> = {
  shopping: "Find something everyone in this mission circle will love under $200",
  plan: "Plan dinner and an activity in Atlanta, GA under $200",
};

/** Runs the selected mission over the plaza; it never replaces or unmounts the home-world scene. */
export function EmbeddedCouncil({
  mode,
  invitedIds,
  onBack,
}: {
  mode: MissionMode;
  invitedIds: string[];
  onBack: () => void;
}) {
  useEffect(() => {
    const requested = new Set(invitedIds);
    const invited = getPeople()
      .filter((person) => requested.has(person.id))
      .slice(0, MAX_SEATS);
    const stage = useStage.getState();
    stage.resetCouncil();
    stage.setMissionText(DEFAULT_MISSIONS[mode]);
    invited.forEach((person, index) => stage.seatSprite(person.id, index));

    // Let Hud install the director listener before the synthetic convene gesture starts the graph.
    const timer = window.setTimeout(() => emitGesture({ type: "convene" }), 100);
    return () => window.clearTimeout(timer);
  }, [invitedIds, mode]);

  function returnToWorld() {
    useStage.getState().resetCouncil();
    onBack();
  }

  return (
    <>
      <Hud plaza />
      <button type="button" className={styles.back} onClick={returnToWorld}>
        End council
      </button>
    </>
  );
}
