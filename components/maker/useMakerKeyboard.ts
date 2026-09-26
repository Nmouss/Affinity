"use client";

import { useEffect } from "react";
import type { MakerAction, MakerState } from "./flow";

// The People Maker's global keyboard map. Grid-local arrow-key navigation lives in OptionGrid;
// Enter/Space picking is free (every control is a real <button>); Tab-between-groups is free
// (roving tabindex keeps individual tiles out of the tab order). This hook only owns the two keys
// that don't fall out of plain HTML: Escape (back a step, or Cancel in the dialog) and Q (open the
// quit dialog from the editor).

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
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.step, dispatch]);
}
