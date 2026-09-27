"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { MakerHands } from "@/components/hands/MakerHands";
import { useRosterHydration } from "@/lib/people/roster";
import { HAND_TARGET_ATTR } from "@/components/hands/makerHitTest";
import { usePlaza } from "@/components/maker/plaza/plazaState";
import { GRABBING_CURSOR_CSS, POINTER_CURSOR_CSS } from "@/components/maker/plaza/plazaIcons";
import type { MakerAction } from "./flow";
import { useMakerFlow } from "./useMakerFlow";
import { useMakerKeyboard } from "./useMakerKeyboard";
import { playBlip } from "./sound";
import { reactCelebrate, reactPick } from "./reactions";
import { PlazaRails } from "./plaza/PlazaRails";
import { EmbeddedCouncil, type MissionMode } from "@/components/stage/EmbeddedCouncil";
import { WhoCirclePanel, WhoSizePanel } from "./WhoPanel";
import { StartPanel } from "./StartPanel";
import { EditorPanel } from "./EditorPanel";
import { QuitDialog } from "./QuitDialog";
import styles from "./PeopleMaker.module.css";

// The R3F canvas is browser-only (WebGL, the Leap socket downstream in MakerHands), so it never
// renders on the server — see components/stage/AffinityStage.tsx for the identical pattern.
const MakerCanvas = dynamic(() => import("./MakerCanvas"), { ssr: false });

/** Actions that count as "the person changed" for the draft preview's happy hop. */
const PICK_ACTIONS = new Set<MakerAction["type"]>([
  "pickCircle",
  "pickSize",
  "startScratch",
  "startPreset",
  "startRandom",
  "setBody",
  "setColor",
  "setPart",
  "setPartColor",
  "adjustEyes",
  "adjustBrows",
  "setCheeksOn",
  "setCheeksColor",
]);

export function PeopleMaker() {
  useRosterHydration();
  const [state, dispatch] = useMakerFlow();
  const [activeMission, setActiveMission] = useState<{
    mode: MissionMode;
    invitedIds: string[];
    recipientIds?: string[];
  } | null>(null);
  useMakerKeyboard(state, dispatch);

  const wrappedDispatch = useCallback(
    (action: MakerAction) => {
      if (PICK_ACTIONS.has(action.type)) reactPick();
      if (action.type === "save") reactCelebrate();
      // Selection lives in the plaza seam (usePlaza), shared with the 3D scene track; clear it
      // whenever we leave the plaza so a stale selection doesn't linger under the editor.
      if (action.type === "newPerson" || action.type === "editPerson") usePlaza.getState().select(null);
      dispatch(action);
    },
    [dispatch],
  );

  useHoverBlips();
  const plazaCursor = usePlazaCursor(state.step === "plaza");

  return (
    <div className={styles.root} style={plazaCursor ? { cursor: plazaCursor } : undefined}>
      <div className={styles.canvas} data-orbit-zone>
        <MakerCanvas step={state.step} draft={state.draft} />
      </div>

      {state.step === "plaza" && (
        <PlazaRails
          dispatch={wrappedDispatch}
          onLaunch={(mode, invitedIds, recipientIds) => {
            if (!activeMission) setActiveMission({ mode, invitedIds, recipientIds });
          }}
        />
      )}

      {activeMission && (
        <EmbeddedCouncil
          mode={activeMission.mode}
          invitedIds={activeMission.invitedIds}
          recipientIds={activeMission.recipientIds}
          onBack={() => setActiveMission(null)}
        />
      )}

      {(state.step === "who-circle" || state.step === "who-size" || state.step === "start") && (
        <div className={styles.overlay}>
          {state.step === "who-circle" && <WhoCirclePanel dispatch={wrappedDispatch} />}
          {state.step === "who-size" && <WhoSizePanel dispatch={wrappedDispatch} />}
          {state.step === "start" && <StartPanel dispatch={wrappedDispatch} />}
        </div>
      )}

      {(state.step === "editor" || state.step === "quit-dialog") && state.draft && (
        <div className={styles.editorShell}>
          <EditorPanel draft={state.draft} tab={state.tab} nameError={state.nameError} dispatch={wrappedDispatch} />
        </div>
      )}

      {state.step === "quit-dialog" && <QuitDialog dispatch={wrappedDispatch} />}

      <MakerHands />
    </div>
  );
}

/**
 * The plaza's mouse cursor: a Wii-remote-style pointing hand, swapping to a grabbing fist while a
 * Mii is being grabbed or dragged (usePlaza.grabbing/draggingId, written by the mouse or a Leap
 * hand — see MakerHands and the plaza scene). Only active in the plaza itself; other steps keep the
 * native cursor over their own buttons and fields.
 */
function usePlazaCursor(active: boolean): string | null {
  const grabbing = usePlaza((s) => s.grabbing || s.draggingId !== null);
  if (!active) return null;
  return grabbing ? GRABBING_CURSOR_CSS : POINTER_CURSOR_CSS;
}

/** A soft hover blip for mouse users (MakerHands plays its own on hand hover). */
function useHoverBlips() {
  const last = useRef<string | null>(null);
  useEffect(() => {
    function onOver(event: PointerEvent) {
      const target = (event.target as Element | null)?.closest(`[${HAND_TARGET_ATTR}]`);
      const id = target?.getAttribute(HAND_TARGET_ATTR) ?? null;
      if (id && id !== last.current) playBlip("hover");
      last.current = id;
    }
    window.addEventListener("pointerover", onOver);
    return () => window.removeEventListener("pointerover", onOver);
  }, []);
}
