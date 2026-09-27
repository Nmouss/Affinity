"use client";

import { useEffect } from "react";
import { itemIdOf } from "@/lib/gestures/hitTest";
import { attachKeyboard, hoverCycle, nextInCycle, type KeyAction } from "@/lib/gestures/keyboard";
import { connectLeap } from "@/lib/gestures/leap";
import {
  framesFlowing,
  freshFrame,
  live,
  receiveFrame,
  requestInputReset,
  setHandshakeAssist,
} from "@/lib/gestures/live";
import { orderedRoster } from "@/lib/people/roster";
import { emitGesture, onGesture } from "@/lib/stage/bus";
import type { HandPose } from "@/lib/stage/slices/hand";
import { useStage } from "@/lib/stage/store";
import { listTargets } from "@/lib/stage/targets";

// Outside the canvas: owns the Leap socket and the keyboard. Frames go into lib/gestures/live.ts for
// HandLayer to read each render; only the slow-changing present/source flags are written here.

const SOURCE_CHECK_MS = 200;

function currentSource(now: number): Pick<HandPose, "present" | "source"> {
  if (!framesFlowing(now)) return { present: false, source: "keyboard" };
  return { present: freshFrame(now)?.hand != null, source: live.service?.replay ? "replay" : "leap" };
}

function syncSource() {
  const next = currentSource(performance.now());
  const { hand, setHand } = useStage.getState();
  if (hand.present !== next.present || hand.source !== next.source) setHand(next);
}

function handleKey(action: KeyAction) {
  const { hand, setHand } = useStage.getState();
  switch (action.kind) {
    case "emit":
      emitGesture(action.event);
      return;
    case "handshake":
      setHandshakeAssist("keyboard", action.held);
      return;
    case "cycleHover": {
      const cycle = hoverCycle(
        listTargets().map(([id]) => id),
        orderedRoster().map((profile) => profile.id),
      );
      const next = nextInCycle(cycle, hand.hoverTarget, action.step);
      if (next === hand.hoverTarget) return;
      setHand({ hoverTarget: next });
      emitGesture({ type: "hover", target: next });
      return;
    }
    case "tapHover":
      if (hand.hoverTarget) emitGesture({ type: "pinchTap", target: hand.hoverTarget });
      return;
    case "swipeHover": {
      const itemId = itemIdOf(hand.hoverTarget);
      if (itemId) emitGesture({ type: "swipe", itemId });
      return;
    }
  }
}

export function InputRoot() {
  useEffect(() => {
    const disconnect = connectLeap(
      (frame) => {
        const hadHand = freshFrame(performance.now())?.hand != null;
        receiveFrame(frame, performance.now());
        if (hadHand !== (frame.hand !== null) || useStage.getState().hand.source === "keyboard") syncSource();
      },
      (status) => {
        live.status = status;
      },
      {
        onService: (info) => {
          live.service = info;
        },
      },
    );
    const timer = window.setInterval(syncSource, SOURCE_CHECK_MS);
    const detachKeys = attachKeyboard({ onAction: handleKey });
    const offReset = onGesture((event) => {
      if (event.type !== "reset") return;
      requestInputReset();
      useStage.getState().setHand({ hoverTarget: null, draggingSpriteId: null, handshakeProgress: 0 });
    });
    return () => {
      disconnect();
      window.clearInterval(timer);
      detachKeys();
      offReset();
      setHandshakeAssist("keyboard", false);
    };
  }, []);

  return null;
}
