"use client";

import { useEffect, useRef } from "react";
import { attachKeyboard, type KeyAction } from "@/lib/gestures/keyboard";
import { setHandshakeAssist } from "@/lib/gestures/live";
import { emitGesture } from "@/lib/stage/bus";
import type { GestureEvent } from "@/types/stage";

// BUG 3: on `/` there was no keyboard fallback for the embedded council at all — InputRoot (the
// room's socket + keyboard owner) is never mounted there. This is the plaza's slice of it: just
// enough keys to approve or bail out of a running mission without a Leap hand. Space holds the same
// handshake meter MakerHands and MandateButton fill (lib/gestures/live.ts's shared assist set), and
// Enter/R convene/reset through the same director bus. Everything else mapKey knows about — seat
// digits, Tab's hover-cycle, P's tap, X's swipe, arrow-key orbit — is the room stage's alone: the
// plaza has no seat/hover targets here, and keeps its own Esc/Q/W/Delete map in useMakerKeyboard.
// attachKeyboard already ignores keys while typing in a form field (isTypingTarget), so this can't
// steal Enter from the mission form.
//
// R emits `reset` (the director's reset() clears the council, hand and scene back to `lobby`) and
// then calls `onReset`, which EmbeddedCouncil wires to its "Leave Affinity" action so the mission
// overlay closes too instead of leaving an empty council on screen.
//
// Renders nothing; EmbeddedCouncil mounts it for as long as a mission is running.

export type PlazaKeyEffect = { kind: "handshake"; held: boolean } | { kind: "emit"; event: GestureEvent };

/** Pure filter, so it's testable without a DOM: narrows every KeyAction down to the handshake hold
 * and convene/reset, and is null for everything this component ignores. */
export function filterPlazaKeyAction(action: KeyAction): PlazaKeyEffect | null {
  if (action.kind === "handshake") return action;
  if (action.kind === "emit" && (action.event.type === "convene" || action.event.type === "reset")) return action;
  return null;
}

export function PlazaCouncilKeys({ onReset }: { onReset?: () => void }) {
  const resetRef = useRef(onReset);
  resetRef.current = onReset;
  useEffect(() => {
    const detach = attachKeyboard({
      onAction(action) {
        const effect = filterPlazaKeyAction(action);
        if (!effect) return;
        if (effect.kind === "handshake") setHandshakeAssist("keyboard", effect.held);
        else {
          emitGesture(effect.event);
          if (effect.event.type === "reset") resetRef.current?.();
        }
      },
    });
    return () => {
      detach();
      setHandshakeAssist("keyboard", false);
    };
  }, []);

  return null;
}
