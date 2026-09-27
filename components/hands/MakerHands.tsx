"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MachineContext } from "@/lib/gestures/detector";
import { createGestureMachine } from "@/lib/gestures/detector";
import { connectLeap, type LeapStatus } from "@/lib/gestures/leap";
import { handshakeAssisted, setHandshakeAssist } from "@/lib/gestures/live";
import { createPointerFilter } from "@/lib/gestures/pointer";
import type { HandFrame } from "@/lib/gestures/types";
import type { GestureEvent } from "@/types/stage";
import { addYaw } from "@/components/maker/turntable";
import { playBlip } from "@/components/maker/sound";
import { usePlaza } from "@/components/maker/plaza/plazaState";
import { emitGesture } from "@/lib/stage/bus";
import { useStage } from "@/lib/stage/store";
import { GrabbingHandGlyph, PointerHandGlyph } from "@/components/maker/plaza/plazaIcons";
import { HAND_HOVER_ATTR, HAND_TARGET_ATTR, ndcToClient, uiTargetValue } from "./makerHitTest";
import { handshakeProgressChanged, pinchHoldsMandate } from "./makerHandshake";
import { resolveHandTarget } from "./makerTargets";
import styles from "./MakerHands.module.css";

// Standalone Leap input for /create: unlike the main stage (a canvas HandLayer fed by the
// module-level lib/gestures/live.ts bridge plus a separate DOM InputRoot), the People Maker has no
// R3F HandLayer to hit-test against — every clickable thing here is a real DOM button — so this one
// component owns the socket, the gesture machine, and a plain requestAnimationFrame loop. Mouse and
// keyboard keep working whether or not a hand is present; this is additive.
//
// It also feeds the plaza seam (components/maker/plaza/plazaState.ts): while a hand is tracked, the
// filtered pointer is written into usePlaza every frame and the pinch-held state on every change, so
// the plaza's 3D scene (owned by a different track) can hover/select/drag people with the same hand
// that clicks these DOM buttons. DOM hover/click (data-hand-target) is untouched: the gesture
// machine only ever emits pinchTap for a `ui:` target (one under a DOM [data-hand-target] element),
// so a pinch that starts over the canvas — with no such target under it — never .click()s anything;
// the scene reads pointer/grabbing directly to handle taps and drags on people itself.
//
// It also carries the handshake: every step (hand tracked or not) passes handshakeAssist from
// lib/gestures/live.ts, so the hold-to-approve button (MandateButton) and Space fill the same meter
// here as they do on the room stage's HandLayer — and it writes the resulting handshakeProgress into
// the hand slice so MandateButton's fill actually moves (reset to 0 on unmount). And a hover/swipe
// over a cart or plan item (data-hand-item, tagged by a different track) resolves to an `item:<id>`
// target via makerTargets.resolveHandTarget, which the detector already turns into a `swipe` event
// forwarded straight to the bus below — a pinch tap on an `item:` target never .click()s anything,
// since uiTargetValue is null for it. A pinch *held* over the hold-to-approve button feeds the
// "pinch" handshake assist (see makerHandshake.pinchHoldsMandate), so it fills like a mouse hold.
//
// The cursor is portalled to <body>: PeopleMaker's fixed root is its own stacking context, which
// would otherwise trap the cursor beneath the welcome greeting (z-index 200) layered over it.

const FRAME_STALE_MS = 250;
const ORBIT_ZONE = "[data-orbit-zone]";

/** Walks an element then each ancestor in turn, for resolveHandTarget's "nearest wins" search. */
function* elementChain(start: Element | null): IterableIterator<Element> {
  for (let element = start; element; element = element.parentElement) yield element;
}

export function MakerHands() {
  const [present, setPresent] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [pinching, setPinching] = useState(false);
  const hoveredElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const filter = createPointerFilter();
    const machine = createGestureMachine({
      emit: (event: GestureEvent) => {
        if (event.type === "hover") {
          // Cleared unconditionally, so hovering an `item:` target (no [data-hand-target] element)
          // or nothing at all still turns the previous glow off.
          if (hoveredElement.current) hoveredElement.current.removeAttribute(HAND_HOVER_ATTR);
          const value = uiTargetValue(event.target);
          const element = value ? (document.querySelector(`[${HAND_TARGET_ATTR}="${cssEscape(value)}"]`) as HTMLElement | null) : null;
          hoveredElement.current = element;
          if (element) {
            element.setAttribute(HAND_HOVER_ATTR, "");
            playBlip("hover");
          }
        } else if (event.type === "pinchTap") {
          // uiTargetValue is null for an `item:` target, so a pinch tap over an item card never
          // .click()s anything — items only respond to swipe.
          const value = uiTargetValue(event.target);
          if (value) {
            const element = document.querySelector(`[${HAND_TARGET_ATTR}="${cssEscape(value)}"]`) as HTMLElement | null;
            element?.click();
          }
        } else if (event.type === "orbit") {
          if (document.elementFromPoint(lastClient.x, lastClient.y)?.closest(ORBIT_ZONE)) addYaw(event.dx);
        } else {
          // While an in-place council is running, forward handshake/swipe semantics to the same
          // director bus used by the room stage. The plaza and its Leap cursor stay mounted.
          emitGesture(event);
        }
      },
    });

    const context: MachineContext = {
      hitTest(pointer) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const [x, y] = ndcToClient(pointer, width, height);
        lastClient.x = x;
        lastClient.y = y;
        return resolveHandTarget(elementChain(document.elementFromPoint(x, y)));
      },
      dropSeat() {
        return null;
      },
    };

    const lastClient = { x: 0, y: 0 };
    let lastFrame: HandFrame | null = null;
    let lastFrameAt = -Infinity;
    let raf = 0;
    let wasPresent = false;
    let wasPinching = false;
    let lastHandshakeProgress = 0;

    /** Writes handshakeProgress into the hand slice only past a small epsilon, so MandateButton's
     * fill (which reads it every render via a CSS variable) moves without spamming the store. */
    const applyHandshakeProgress = (progress: number) => {
      if (!handshakeProgressChanged(lastHandshakeProgress, progress)) return;
      lastHandshakeProgress = progress;
      useStage.getState().setHand({ handshakeProgress: progress });
    };

    const disconnect = connectLeap(
      (frame) => {
        lastFrame = frame;
        lastFrameAt = performance.now();
      },
      (status: LeapStatus) => {
        if (status !== "open") setPresent(false);
      },
    );

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const fresh = now - lastFrameAt < FRAME_STALE_MS ? lastFrame : null;
      const tracked = fresh?.hand ?? null;
      // Read every frame so the button/Space can fill the handshake even with no Leap hand at all.
      const handshakeAssist = handshakeAssisted();

      if (!tracked) {
        setHandshakeAssist("pinch", false);
        const snap = machine.step({ t: now, hand: null, handshakeAssist }, context);
        applyHandshakeProgress(snap.handshakeProgress);
        setPresent((was) => (was ? false : was));
        setCursor((was) => (was === null ? was : null));
        if (wasPresent) {
          // The hand just left: hand off the plaza pointer so the scene stops hovering/dragging.
          usePlaza.getState().setPointer(null, null);
          if (wasPinching) usePlaza.getState().setGrabbing(false);
          wasPresent = false;
          wasPinching = false;
          setPinching(false);
        }
        return;
      }

      const pointer = filter.update(tracked.palm, fresh!.timestamp);
      const snap = machine.step(
        {
          t: now,
          hand: {
            pointer,
            pinch: tracked.pinchStrength,
            grab: tracked.grabStrength,
            rollRadians: tracked.rollRadians,
            velocityX: tracked.velocity[0],
          },
          handshakeAssist,
        },
        context,
      );
      applyHandshakeProgress(snap.handshakeProgress);
      const hovered = hoveredElement.current;
      const buttonEnabled = hovered instanceof HTMLButtonElement && !hovered.disabled;
      setHandshakeAssist("pinch", pinchHoldsMandate(snap, buttonEnabled));
      const [x, y] = ndcToClient(pointer, window.innerWidth, window.innerHeight);
      lastClient.x = x;
      lastClient.y = y;
      setPresent(true);
      setCursor({ x, y });
      wasPresent = true;

      // Every frame, so the plaza scene's raycast tracks the hand as smoothly as the mouse would.
      usePlaza.getState().setPointer(pointer, "hand");
      const pinchingNow = machine.snapshot().pinching;
      if (pinchingNow !== wasPinching) {
        wasPinching = pinchingNow;
        usePlaza.getState().setGrabbing(pinchingNow);
        setPinching(pinchingNow);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      disconnect();
      setHandshakeAssist("pinch", false);
      if (hoveredElement.current) hoveredElement.current.removeAttribute(HAND_HOVER_ATTR);
      usePlaza.getState().setPointer(null, null);
      usePlaza.getState().setGrabbing(false);
      useStage.getState().setHand({ handshakeProgress: 0 });
    };
  }, []);

  if (!present || !cursor) return null;
  return createPortal(
    <div className={styles.cursor} style={{ left: cursor.x, top: cursor.y }} aria-hidden>
      {pinching ? <GrabbingHandGlyph /> : <PointerHandGlyph />}
    </div>,
    document.body,
  );
}

/** Minimal CSS.escape fallback (data-hand-target values are our own slug strings, but escape anyway). */
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}
