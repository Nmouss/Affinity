"use client";

import { useEffect } from "react";
import { usePlaza } from "@/components/maker/plaza/plazaState";
import { playWhistle } from "./sound";
import type { MakerAction, MakerState } from "./flow";

// The People Maker's global keyboard map. Grid-local arrow-key navigation lives in OptionGrid;
// Enter/Space picking is free (every control is a real <button>); Tab-between-groups is free
// (roving tabindex keeps individual tiles out of the tab order). This hook owns the keys that
// don't fall out of plain HTML: Escape (back a step, or Cancel in the dialog), Q (open the quit
// dialog from the editor), and, in the plaza only, W (toggle the whistle) and Delete (remove the
// selected Mii, with the same confirm the Remove rail icon uses).

/** Keys the taste step answers to, and what they mean. Exported so the map is testable. */
export const TASTE_KEYS: Record<string, MakerAction> = {
  ArrowLeft: { type: "tasteChoice", choice: "left" },
  ArrowRight: { type: "tasteChoice", choice: "right" },
  n: { type: "tasteChoice", choice: "neither" },
  N: { type: "tasteChoice", choice: "neither" },
  s: { type: "tasteChoice", choice: "skip" },
  S: { type: "tasteChoice", choice: "skip" },
  u: { type: "tasteUndo" },
  U: { type: "tasteUndo" },
  Backspace: { type: "tasteUndo" },
  Enter: { type: "tasteDone" },
};

/** The maker action a key means in the given step, or null when the key is free. */
export function keyAction(step: MakerState["step"], key: string): MakerAction | null {
  if (step === "taste") return TASTE_KEYS[key] ?? null;
  if (step === "meet" && key === "Enter") return { type: "meetDone" };
  return null;
}

export function useMakerKeyboard(state: MakerState, dispatch: (action: MakerAction) => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const typing = document.activeElement instanceof HTMLInputElement;
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "back" });
        return;
      }
      if (!typing && (state.step === "taste" || state.step === "meet")) {
        // A focused button handles its own Enter/Space; only the free keys go through here.
        if (event.key === "Enter" && document.activeElement instanceof HTMLButtonElement) return;
        const action = keyAction(state.step, event.key);
        if (action) {
          event.preventDefault();
          dispatch(action);
        }
        return;
      }
      if (!typing && (event.key === "q" || event.key === "Q") && state.step === "editor") {
        event.preventDefault();
        dispatch({ type: "quit" });
        return;
      }
      if (typing || state.step !== "plaza") return;
      if (event.key === "w" || event.key === "W") {
        event.preventDefault();
        const { whistle, setWhistle } = usePlaza.getState();
        const on = !whistle.on;
        setWhistle({ on });
        if (on) playWhistle();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const selectedId = usePlaza.getState().selectedId;
        if (!selectedId) return;
        event.preventDefault();
        if (state.plazaConfirmRemoveId === selectedId) dispatch({ type: "confirmRemove" });
        else dispatch({ type: "requestRemove", id: selectedId });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.step, state.plazaConfirmRemoveId, dispatch]);
}
