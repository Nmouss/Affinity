"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { button, folder, useControls } from "leva";
import { COUNCIL_RING } from "@/lib/stage/layout";
import { FAMILY } from "@/lib/stage/slices/council";
import { useStage } from "@/lib/stage/store";
import type { SpriteMood } from "@/types/stage";
import { spriteTuning } from "./materials";
import { SPRITE_MOODS } from "./moodStyle";

// Lab-only leva controls (the panel is hidden outside /lab): glow tuning, forcing moods, the conflict
// beat, and a simulated hand so drag-follow, hover, and eye tracking can be checked without Leap.

type SimHand = "off" | "hover" | "drag";

const LONG_LINE =
  "Okay, hear me out: a tree that is exactly four feet tall, warm white lights, and a little gold on top, because anything bigger swallows the living room whole.";

export function SpriteLab() {
  const selection = useRef<{ sprite: string; mood: SpriteMood; simHand: SimHand }>({
    sprite: "son",
    mood: "thinking",
    simHand: "off",
  });
  const simActive = useRef(false);

  const values = useControls("sprites", {
    glow: { value: spriteTuning.glow, min: 0, max: 3, step: 0.05, onChange: (v: number) => void (spriteTuning.glow = v) },
    rim: { value: spriteTuning.rim, min: 0, max: 4, step: 0.05, onChange: (v: number) => void (spriteTuning.rim = v) },
    sprite: { value: "son", options: Object.fromEntries(FAMILY.map((profile) => [profile.name, profile.id])) },
    mood: { value: "thinking", options: [...SPRITE_MOODS] },
    "set mood": button(() => {
      const { sprite, mood } = selection.current;
      useStage.getState().setSpriteMood(sprite, mood);
    }),
    "all thinking": button(() => FAMILY.forEach((profile) => useStage.getState().setSpriteMood(profile.id, "thinking"))),
    "test bubble": button(() =>
      useStage.getState().applyCouncilEvent({
        type: "opinion",
        payload: { spriteId: selection.current.sprite, say: LONG_LINE, hardRules: [], wishes: [], vetoes: [] },
      }),
    ),
    beats: folder({
      "veto (Maya vs Leo)": button(() => {
        const stage = useStage.getState();
        stage.setConflict({ wishBy: "son", ruleBy: "wife", itemId: "inflatable-trex", resolvedItemId: "orn-dino" });
        stage.setPhase("conflict");
      }),
      "bundle arrives": button(() => useStage.getState().setPhase("bundle")),
      celebrate: button(() => useStage.getState().setPhase("receipt")),
    }),
    simHand: { value: "off", options: ["off", "hover", "drag"], label: "sim hand" },
  });
  selection.current = {
    sprite: values.sprite as string,
    mood: values.mood as SpriteMood,
    simHand: values.simHand as SimHand,
  };

  useFrame(({ clock }) => {
    const { sprite, simHand } = selection.current;
    const { setHand } = useStage.getState();
    if (simHand === "off") {
      if (simActive.current) setHand({ present: false, hoverTarget: null, draggingSpriteId: null, floorPoint: null });
      simActive.current = false;
      return;
    }
    simActive.current = true;
    const t = clock.elapsedTime * 0.5;
    const [cx, , cz] = COUNCIL_RING.center;
    const radius = COUNCIL_RING.radius + 1.2;
    setHand({
      present: true,
      floorPoint: [cx + Math.sin(t) * radius, 0, cz + Math.cos(t) * radius * 0.8],
      hoverTarget: simHand === "hover" ? `sprite:${sprite}` : null,
      draggingSpriteId: simHand === "drag" ? sprite : null,
    });
  });

  return null;
}
