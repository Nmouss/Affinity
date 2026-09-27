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

export function useMakerKeyboard(state: MakerState, dispatch: (action: MakerAction) => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const typing = document.activeElement instanceof HTMLInputElement;
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "back" });
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
