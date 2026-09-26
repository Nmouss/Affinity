"use client";

import { useEffect, useRef, useState } from "react";
import type { MachineContext } from "@/lib/gestures/detector";
import { createGestureMachine } from "@/lib/gestures/detector";
import { connectLeap, type LeapStatus } from "@/lib/gestures/leap";
import { createPointerFilter } from "@/lib/gestures/pointer";
import type { HandFrame } from "@/lib/gestures/types";
import type { GestureEvent } from "@/types/stage";
import { addYaw } from "@/components/maker/turntable";
import { playBlip } from "@/components/maker/sound";
import { HAND_HOVER_ATTR, HAND_TARGET_ATTR, ndcToClient, uiTargetId, uiTargetValue } from "./makerHitTest";
import styles from "./MakerHands.module.css";

// Standalone Leap input for /create: unlike the main stage (a canvas HandLayer fed by the
// module-level lib/gestures/live.ts bridge plus a separate DOM InputRoot), the People Maker has no
// R3F HandLayer to hit-test against — every clickable thing here is a real DOM button — so this one
// component owns the socket, the gesture machine, and a plain requestAnimationFrame loop. Mouse and
// keyboard keep working whether or not a hand is present; this is additive.

const FRAME_STALE_MS = 250;
const ORBIT_ZONE = "[data-orbit-zone]";

function closestHandTarget(element: Element | null): HTMLElement | null {
  return element?.closest(`[${HAND_TARGET_ATTR}]`) as HTMLElement | null;
}

export function MakerHands() {
  const [present, setPresent] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const hoveredElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const filter = createPointerFilter();
    const machine = createGestureMachine({
      emit: (event: GestureEvent) => {
        if (event.type === "hover") {
          if (hoveredElement.current) hoveredElement.current.removeAttribute(HAND_HOVER_ATTR);
          const value = uiTargetValue(event.target);
          const element = value ? (document.querySelector(`[${HAND_TARGET_ATTR}="${cssEscape(value)}"]`) as HTMLElement | null) : null;
          hoveredElement.current = element;
          if (element) {
            element.setAttribute(HAND_HOVER_ATTR, "");
            playBlip("hover");
          }
        } else if (event.type === "pinchTap") {
          const value = uiTargetValue(event.target);
          if (value) {
            const element = document.querySelector(`[${HAND_TARGET_ATTR}="${cssEscape(value)}"]`) as HTMLElement | null;
            element?.click();
          }
        } else if (event.type === "orbit") {
          if (document.elementFromPoint(lastClient.x, lastClient.y)?.closest(ORBIT_ZONE)) addYaw(event.dx);
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
        const target = closestHandTarget(document.elementFromPoint(x, y));
        const value = target?.getAttribute(HAND_TARGET_ATTR);
        return value ? uiTargetId(value) : null;
      },
      dropSeat() {
        return null;
      },
    };

    const lastClient = { x: 0, y: 0 };
    let lastFrame: HandFrame | null = null;
    let lastFrameAt = -Infinity;
    let raf = 0;

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

      if (!tracked) {
        machine.step({ t: now, hand: null }, context);
        setPresent((was) => (was ? false : was));
        setCursor((was) => (was === null ? was : null));
        return;
      }

      const pointer = filter.update(tracked.palm, fresh!.timestamp);
      machine.step(
        {
          t: now,
          hand: {
            pointer,
            pinch: tracked.pinchStrength,
            grab: tracked.grabStrength,
            rollRadians: tracked.rollRadians,
            velocityX: tracked.velocity[0],
          },
        },
        context,
      );
      const [x, y] = ndcToClient(pointer, window.innerWidth, window.innerHeight);
      lastClient.x = x;
      lastClient.y = y;
      setPresent(true);
      setCursor({ x, y });
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      disconnect();
      if (hoveredElement.current) hoveredElement.current.removeAttribute(HAND_HOVER_ATTR);
    };
  }, []);

  if (!present || !cursor) return null;
  return <div className={styles.cursor} style={{ left: cursor.x, top: cursor.y }} aria-hidden />;
}

/** Minimal CSS.escape fallback (data-hand-target values are our own slug strings, but escape anyway). */
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}
