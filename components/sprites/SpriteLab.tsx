"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { button, folder, useControls } from "leva";
import { getPeople } from "@/lib/people/roster";
import { COUNCIL_RING } from "@/lib/stage/layout";
import { useStage } from "@/lib/stage/store";
import type { SpriteMood } from "@/types/stage";
import { characterTuning } from "./characterPose";
import { SPRITE_MOODS } from "./moodStyle";

// Lab-only leva controls (the panel is hidden outside /lab): character tuning, forcing moods, the
// conflict beat, a seat/home walk toggle, and a simulated hand so drag-follow, hover, and eye
// tracking can be checked without Leap.

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
    "character scale": {
      value: characterTuning.scale,
      min: 0.6,
      max: 1.6,
      step: 0.02,
      onChange: (v: number) => void (characterTuning.scale = v),
    },
    "walk speed": {
      value: characterTuning.walkSpeed,
      min: 0.3,
      max: 2,
      step: 0.05,
      onChange: (v: number) => void (characterTuning.walkSpeed = v),
    },
    sprite: { value: "son", options: Object.fromEntries(getPeople().map((profile) => [profile.name, profile.id])) },
    mood: { value: "thinking", options: [...SPRITE_MOODS] },
    "set mood": button(() => {
      const { sprite, mood } = selection.current;
      useStage.getState().setSpriteMood(sprite, mood);
    }),
    "all thinking": button(() => getPeople().forEach((profile) => useStage.getState().setSpriteMood(profile.id, "thinking"))),
    "test bubble": button(() =>
      useStage.getState().applyCouncilEvent({
        type: "opinion",
        payload: { spriteId: selection.current.sprite, say: LONG_LINE, hardRules: [], wishes: [], vetoes: [] },
      }),
    ),
    "walk: seat ↔ home": button(() => {
      const stage = useStage.getState();
      const { sprite } = selection.current;
      const seat = stage.sprites[sprite]?.seat ?? null;
      stage.seatSprite(sprite, seat === null ? 1 : null);
    }),
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
