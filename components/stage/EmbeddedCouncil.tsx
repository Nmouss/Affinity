"use client";

import { useEffect } from "react";
import { PlazaCouncilKeys } from "@/components/hands/PlazaCouncilKeys";
import { Hud } from "@/components/hud/Hud";
import { emitGesture } from "@/lib/stage/bus";
import { getPeople, getPerson } from "@/lib/people/roster";
import { MAX_SEATS } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import { handTarget } from "@/components/hands/makerHitTest";
import styles from "./EmbeddedCouncil.module.css";

export type MissionMode = "shopping" | "plan";

function shoppingPrompt(recipientIds: string[]): string {
  const names = recipientIds.map((id) => getPerson(id)?.name ?? id);
  if (names.length === 1) return `Find a gift for ${names[0]} under $200`;
  return `Find a separate gift for each of ${names.join(", ")} under $200`;
}

const DEFAULT_MISSIONS: Record<MissionMode, string> = {
  shopping: "Find something everyone in this mission circle will love under $200",
  plan: "Plan dinner and an activity in Atlanta, GA under $200",
};

/** Runs the selected mission over the plaza; it never replaces or unmounts the home-world scene. */
export function EmbeddedCouncil({
  mode,
  invitedIds,
  recipientIds = [],
  onBack,
}: {
  mode: MissionMode;
  invitedIds: string[];
  recipientIds?: string[];
  onBack: () => void;
}) {
  useEffect(() => {
    const requested = new Set(invitedIds);
    const known = new Set(getPeople().map((person) => person.id));
    // Keep the caller's order: for a gift, the recipient comes first and sits by the hearth.
    const invited = invitedIds
      .filter((id, index) => known.has(id) && invitedIds.indexOf(id) === index)
      .slice(0, MAX_SEATS)
      .map((id) => getPerson(id)!);
    const stage = useStage.getState();
    stage.resetCouncil();
    const recipients = recipientIds.filter((id) => requested.has(id));
    stage.setRecipientIds(mode === "shopping" ? recipients : []);
    stage.setMissionText(mode === "shopping" && recipients.length > 0 ? shoppingPrompt(recipients) : DEFAULT_MISSIONS[mode]);
    invited.forEach((person, index) => stage.seatSprite(person.id, index));

    // Let Hud install the director listener before the synthetic convene gesture starts the graph.
    const timer = window.setTimeout(() => emitGesture({ type: "convene" }), 100);
    return () => window.clearTimeout(timer);
  }, [invitedIds, mode, recipientIds]);

  function returnToWorld() {
    useStage.getState().resetCouncil();
    onBack();
  }

  return (
    <>
      <Hud plaza />
      <PlazaCouncilKeys onReset={returnToWorld} />
      <button type="button" {...handTarget("council-stop")} className={styles.back} onClick={returnToWorld}>
        Stop agents
      </button>
    </>
  );
}
